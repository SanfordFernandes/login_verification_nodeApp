show databases;
create database users;
use users;
show tables;

create table users(
id INT auto_increment,
mail varchar(255),
ph_no varchar(255),
first_name varchar(255),
last_name varchar(255),	
emailOTP int,
phoneOTP int,
emailVerified boolean, 
phoneVerified boolean,
primary key(id)
);

insert into users (mail, ph_no, first_name, last_name) values ('san@gmail.com', '7721', 'san', 'fdes');
update users set emailVerified = 0 where id = 1;

select * from users;
truncate table users;

delete from users where id = 1;
drop table users;