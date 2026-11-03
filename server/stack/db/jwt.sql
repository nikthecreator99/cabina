-- CABINA: срок жизни токена входа (секунды) — для функций базы, которые его читают.
\set jwt_exp `echo "$JWT_EXP"`

ALTER DATABASE postgres SET "app.settings.jwt_exp" TO :'jwt_exp';
