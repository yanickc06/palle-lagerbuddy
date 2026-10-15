<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli')exit(1);
require_once dirname(__DIR__).'/app/bootstrap.php';
try{
 $username=$argv[1]??'';$q=db()->prepare('SELECT id FROM palle_users WHERE username=?');$q->execute([$username]);$id=$q->fetchColumn();if(!$id)throw new RuntimeException('Benutzer nicht gefunden.');
 fwrite(STDOUT,"Neues Passwort: ");$tty=function_exists('posix_isatty')&&posix_isatty(STDIN);if($tty)system('stty -echo');try{$password=rtrim(fgets(STDIN)?:'',"\r\n");}finally{if($tty){system('stty echo');fwrite(STDOUT,"\n");}}
 if(strlen($password)<12)throw new RuntimeException('Mindestens 12 Zeichen erforderlich.');db()->prepare('UPDATE palle_users SET password_hash=? WHERE id=?')->execute([password_hash($password,PASSWORD_DEFAULT),$id]);
 // Bestehende Sitzungen bei einer Passwortänderung abmelden.
 foreach(glob(storage().'/sessions/sess_*')?:[] as $file)unlink($file);
 fwrite(STDOUT,"Passwort geändert. Bitte neu anmelden.\n");
}catch(Throwable $e){fwrite(STDERR,$e->getMessage()."\n");exit(1);}
