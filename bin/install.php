<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli')exit(1);
require_once dirname(__DIR__).'/app/bootstrap.php';
try{
    migrate();
    $username=$argv[1]??'';
    if(trim($username)===''){fwrite(STDERR,"Aufruf: php bin/install.php BENUTZERNAME\nPasswort wird über stdin eingelesen.\n");exit(1);}
    if(db()->query('SELECT COUNT(*) FROM palle_users')->fetchColumn()>0)throw new RuntimeException('Ein Benutzer existiert bereits. Für Passwortänderungen bin/password.php verwenden.');
    fwrite(STDOUT,"Passwort (mindestens 12 Zeichen): ");
    $tty=function_exists('posix_isatty')&&posix_isatty(STDIN);if($tty)system('stty -echo');
    try{$password=rtrim(fgets(STDIN)?:'',"\r\n");}finally{if($tty){system('stty echo');fwrite(STDOUT,"\n");}}
    if(strlen($password)<12)throw new RuntimeException('Passwort muss mindestens 12 Zeichen haben.');
    $id=bin2hex(random_bytes(16));$id=substr($id,0,8).'-'.substr($id,8,4).'-'.substr($id,12,4).'-'.substr($id,16,4).'-'.substr($id,20);
    db()->prepare('INSERT INTO palle_users(id,username,password_hash) VALUES(?,?,?)')->execute([$id,$username,password_hash($password,PASSWORD_DEFAULT)]);
    fwrite(STDOUT,"Palle ist eingerichtet. Jetzt die HTTPS-Adresse öffnen und anmelden.\n");
}catch(Throwable $e){fwrite(STDERR,$e->getMessage()."\n");exit(1);}
