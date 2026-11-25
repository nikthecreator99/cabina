"""Single-item Robokassa checkout. Set SHA256 in the merchant dashboard."""
import hashlib
import hmac
import json
import os
import sqlite3
import sys
import time
import uuid
from contextlib import closing
from decimal import Decimal, InvalidOperation
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import parse_qs, quote
from urllib.request import Request, urlopen

MODE = os.getenv("SHOP_MODE", "off")
LOGIN = os.getenv("ROBOKASSA_LOGIN", "")
PASSWORD1 = os.getenv("ROBOKASSA_PASSWORD1", "")
PASSWORD2 = os.getenv("ROBOKASSA_PASSWORD2", "")
ACTIVE = MODE in ("test", "live") and all((LOGIN, PASSWORD1, PASSWORD2)) and PASSWORD1 != PASSWORD2
CATALOG = json.loads(Path(os.getenv("SHOP_CATALOG", Path(__file__).resolve().parent.parent.parent / "data/shop-catalog.json")).read_text())
DB = Path(os.getenv("SHOP_DATA", "/var/lib/shop")) / ("robokassa-" + MODE + ".sqlite3")
TERMS = "2026-11-25"

class Problem(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status

def database():
    db = sqlite3.connect(DB, timeout=10)
    db.row_factory = sqlite3.Row
    return db

def setup():
    with closing(database()) as db:
        db.executescript("""
            create table if not exists orders (
                id integer primary key autoincrement, buyer text not null, sku text not null,
                rub integer not null, terms text not null, created integer not null,
                state text not null default 'pending');
            create unique index if not exists active_purchase on orders(buyer,sku)
                where state in ('pending','paid');
        """)

def buyer(token):
    if not token.startswith("Bearer "):
        raise Problem(401, "Войдите в CABINA.")
    try:
        with urlopen(Request("http://auth:9999/user", headers={"Authorization":token}),timeout=8) as result:
            user = json.load(result)
        return str(uuid.UUID(user["id"])), user["email"]
    except HTTPError as error:
        if error.code in (401,403):
            raise Problem(401, "Войдите в CABINA повторно.") from error
        raise

def signature(*parts):
    return hashlib.sha256(":".join(parts).encode()).hexdigest()

def checkout(db, uid, email, data):
    if not ACTIVE:
        raise Problem(503, "Оплата пока недоступна.")
    sku = data.get("sku")
    item = CATALOG.get(sku)
    if not item or data.get("terms") != TERMS or data.get("price") != item["price"]:
        raise Problem(409, "Обновите страницу и проверьте условия покупки.")
    with db:
        db.execute("begin immediate")
        db.execute("insert or ignore into orders(buyer,sku,rub,terms,created) values(?,?,?,?,?)",
                   (uid,sku,item["price"],TERMS,int(time.time())))
        row = db.execute("select * from orders where buyer=? and sku=? and state in ('pending','paid')",(uid,sku)).fetchone()
    if row["state"] == "paid":
        return {"owned":True}
    if row["rub"] != item["price"] or row["terms"] != TERMS:
        raise Problem(409, "Цена заказа изменилась. Обратитесь в поддержку.")
    amount, invoice = f'{row["rub"]}.00', str(row["id"])
    receipt = quote(json.dumps({"items":[{"name":item["name"],"quantity":1,"sum":row["rub"],"tax":"none"}]},
                               ensure_ascii=False,separators=(",",":")), safe="")
    fields = dict(MerchantLogin=LOGIN, OutSum=amount, InvId=invoice, Receipt=receipt, Email=email,
                  Description="CABINA · " + item["name"], SignatureValue=signature(LOGIN,amount,invoice,receipt,PASSWORD1))
    if MODE == "test":
        fields["IsTest"] = "1"
    return {"fields":fields}

def confirm(db, raw):
    if not ACTIVE:
        raise Problem(503, "Магазин закрыт.")
    parsed = parse_qs(raw, max_num_fields=64)
    if any(len(values)!=1 or key.lower().startswith("shp_") for key,values in parsed.items()):
        raise Problem(400, "Некорректное уведомление.")
    amount, invoice, provided = (parsed[k][0] for k in ("OutSum","InvId","SignatureValue"))
    if not invoice.isascii() or not invoice.isdecimal() or len(invoice)>19:
        raise Problem(400, "Некорректный номер заказа.")
    if not hmac.compare_digest(signature(amount,invoice,PASSWORD2),provided.lower()):
        raise Problem(403, "Неверная подпись.")
    with db:
        row = db.execute("select rub from orders where id=?",(invoice,)).fetchone()
        if not row or Decimal(amount) != row["rub"]:
            raise Problem(409, "Заказ или сумма не совпадают.")
        db.execute("update orders set state='paid' where id=? and state='pending'",(invoice,))
    return "OK"+invoice

class Shop(BaseHTTPRequestHandler):
    def log_message(self,*args):
        pass

    def route(self,db):
        if self.command=="GET" and self.path=="/catalog":
            return {"mode":MODE if ACTIVE else "off","terms":TERMS}
        body = b""
        if self.command=="POST":
            size=int(self.headers.get("Content-Length",0))
            if not 0<size<=16384:
                raise Problem(400,"Некорректный размер запроса.")
            body=self.rfile.read(size)
            if self.path=="/result":
                return confirm(db,body.decode())
        uid,email=buyer(self.headers.get("Authorization",""))
        if self.command=="POST" and self.path=="/checkout":
            return checkout(db,uid,email,json.loads(body))
        if self.command=="GET" and self.path in ("/status","/owned"):
            return {"owned":[r[0] for r in db.execute("select sku from orders where buyer=? and state='paid'",(uid,))]}
        raise Problem(404,"Страница не найдена.")

    def handle_shop(self):
        try:
            with closing(database()) as db:
                result=self.route(db)
            status=200
        except Problem as error:
            status,result=error.status,{"message":str(error)}
        except (KeyError,ValueError,InvalidOperation,TypeError,AttributeError):
            status,result=400,{"message":"Некорректные данные."}
        except Exception:
            status,result=503,{"message":"Сервис временно недоступен."}
        plain=isinstance(result,str)
        payload=(result if plain else json.dumps(result,ensure_ascii=False)).encode()
        self.send_response(status)
        self.send_header("Content-Type",("text/plain" if plain else "application/json")+"; charset=utf-8")
        self.send_header("Cache-Control","no-store")
        self.send_header("Content-Length",str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    do_GET=do_POST=handle_shop

if __name__=="__main__":
    setup()
    if len(sys.argv) == 3 and sys.argv[1] == "record-refund":
        # Run only after the merchant verifies a completed full refund.
        with closing(database()) as db, db:
            row = db.execute("select state from orders where id=?", (int(sys.argv[2]),)).fetchone()
            if not row or row["state"] not in ("paid", "refunded"):
                sys.exit("Оплаченный заказ не найден")
            db.execute("update orders set state='refunded' where id=?", (int(sys.argv[2]),))
    elif len(sys.argv) == 1:
        ThreadingHTTPServer(("",8788),Shop).serve_forever()
    else:
        sys.exit("Usage: server.py [record-refund invoice]")
