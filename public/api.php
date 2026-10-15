<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/app/bootstrap.php';
require_once dirname(__DIR__) . '/app/validation.php';
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');
try {
    $c=config();startSession();
    $method=$_SERVER['REQUEST_METHOD'];$action=$_GET['action']??'';
    if (isset($_SERVER['HTTP_ORIGIN'])) {
        $expected=(parse_url($c['app_url'],PHP_URL_SCHEME)?:'https').'://'.parse_url($c['app_url'],PHP_URL_HOST).(parse_url($c['app_url'],PHP_URL_PORT)?':'.parse_url($c['app_url'],PHP_URL_PORT):'');
        if($_SERVER['HTTP_ORIGIN']!==$expected)sendJson(['error'=>'Unerlaubte Herkunft.'],403);
    }
    if($action==='login'&&$method==='POST'){
        $data=inputJson();$username=$data['username']??'';$password=$data['password']??'';
        must(is_string($username)&&is_string($password)&&strlen($username)<=190&&strlen($password)<=1000,'Ungültige Anmeldedaten.');
        $hash=hash('sha256',$_SERVER['REMOTE_ADDR']??'unknown');
        $q=db()->prepare('SELECT * FROM palle_login_attempts WHERE ip_hash=?');$q->execute([$hash]);$attempt=$q->fetch();
        if($attempt&&$attempt['failures']>=10&&(time()-(int)$attempt['last_attempt'])<900)sendJson(['error'=>'Zu viele Anmeldeversuche. Bitte in 15 Minuten erneut versuchen.'],429);
        $q=db()->prepare('SELECT * FROM palle_users WHERE username=?');$q->execute([$username]);$user=$q->fetch();
        if(!$user||!password_verify($password,$user['password_hash'])){
            $count=$attempt&&(time()-(int)$attempt['last_attempt'])<900?(int)$attempt['failures']+1:1;
            db()->prepare('DELETE FROM palle_login_attempts WHERE ip_hash=?')->execute([$hash]);db()->prepare('INSERT INTO palle_login_attempts(ip_hash,failures,last_attempt) VALUES(?,?,?)')->execute([$hash,$count,time()]);
            sendJson(['error'=>'Benutzername oder Passwort stimmt nicht.'],401);
        }
        db()->prepare('DELETE FROM palle_login_attempts WHERE ip_hash=?')->execute([$hash]);session_regenerate_id(true);$_SESSION['user_id']=$user['id'];$_SESSION['username']=$user['username'];$_SESSION['csrf']=bin2hex(random_bytes(32));
        sendJson(['user'=>['id'=>$user['id'],'name'=>$user['username']],'csrf'=>$_SESSION['csrf']]);
    }
    $userId=guard(!in_array($method,['GET','HEAD'],true));
    if($action==='session'&&$method==='GET')sendJson(['user'=>['id'=>$userId,'name'=>$_SESSION['username']],'csrf'=>$_SESSION['csrf']]);
    if($action==='logout'&&$method==='POST'){session_destroy();setcookie('palle_session','',['expires'=>1,'path'=>'/','secure'=>$c['secure_cookie']??true,'httponly'=>true,'samesite'=>'Strict']);sendJson(['ok'=>true]);}
    if($action==='state'&&$method==='GET'){$row=db()->query('SELECT revision,payload FROM palle_state WHERE id=1')->fetch();sendJson(['revision'=>(int)$row['revision'],'state'=>json_decode($row['payload'],true,512,JSON_THROW_ON_ERROR)]);}
    if($action==='state'&&$method==='PUT'){
        $data=inputJson();must(is_int($data['revision']??null)&&is_array($data['state']??null),'Ungültiger Datenstand.');validateState($data['state'],$userId);
        $payload=json_encode($data['state'],JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE);
        $q=db()->prepare('UPDATE palle_state SET payload=?,revision=revision+1 WHERE id=1 AND revision=?');$q->execute([$payload,$data['revision']]);
        if($q->rowCount()!==1)sendJson(['error'=>'Neuere Änderungen sind auf dem Server vorhanden.'],409);
        sendJson(['revision'=>$data['revision']+1]);
    }
    if($action==='photo'&&$method==='POST'){
        $pid=$_POST['id']??'';must(validId($pid),'Ungültige Foto-ID.');
        $q=db()->prepare('SELECT * FROM palle_photos WHERE id=?');$q->execute([$pid]);$existing=$q->fetch();
        if($existing){must($existing['user_id']===$userId,'Ungültige Foto-ID.');sendJson(['id'=>$pid]);}
        $file=$_FILES['photo']??null;must(is_array($file)&&$file['error']===UPLOAD_ERR_OK,'Foto-Upload fehlgeschlagen. Bitte die Upload-Grenzen des Servers prüfen.');
        must($file['size']<=12*1024*1024,'Foto ist größer als 12 MB.');$mime=(new finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']);
        $extensions=['image/jpeg'=>'jpg','image/png'=>'png','image/webp'=>'webp'];must(isset($extensions[$mime]),'Nur JPEG, PNG und WebP sind erlaubt.');
        $size=getimagesize($file['tmp_name']);must($size!==false&&$size[0]*$size[1]<=50000000,'Ungültiges oder zu großes Bild.');
        $dir=storage().'/photos';if(!is_dir($dir))mkdir($dir,0700,true);$filename=$pid.'.'.$extensions[$mime];
        must(move_uploaded_file($file['tmp_name'],$dir.'/'.$filename),'Foto konnte nicht gespeichert werden.');chmod($dir.'/'.$filename,0600);
        db()->prepare('INSERT INTO palle_photos(id,user_id,filename,mime,created_at) VALUES(?,?,?,?,?)')->execute([$pid,$userId,$filename,$mime,gmdate('c')]);sendJson(['id'=>$pid],201);
    }
    if($action==='photo'&&$method==='GET'){
        $pid=$_GET['id']??'';must(validId($pid),'Ungültige Foto-ID.');$q=db()->prepare('SELECT filename,mime FROM palle_photos WHERE id=? AND user_id=?');$q->execute([$pid,$userId]);$photo=$q->fetch();
        if(!$photo)sendJson(['error'=>'Foto nicht gefunden.'],404);$path=storage().'/photos/'.$photo['filename'];if(!is_file($path))sendJson(['error'=>'Fotodatei fehlt.'],404);
        header('Content-Type: '.$photo['mime']);header('Content-Length: '.filesize($path));header('Content-Disposition: inline; filename="'.$photo['filename'].'"');readfile($path);exit;
    }
    if($action==='push-info'&&$method==='GET')sendJson(['publicKey'=>$c['vapid_public']??'']);
    if($action==='subscription'&&$method==='POST'){
        $data=inputJson();$endpoint=$data['endpoint']??'';must(is_string($endpoint)&&strlen($endpoint)<4096&&isHttpsEndpoint($endpoint),'Unbekannter Push-Dienst.');
        foreach(['p256dh','auth'] as $key)must(is_string($data['keys'][$key]??null)&&strlen($data['keys'][$key])<300,'Ungültiger Push-Schlüssel.');
        $hash=hash('sha256',$endpoint);db()->prepare('DELETE FROM palle_subscriptions WHERE endpoint_hash=? AND user_id=?')->execute([$hash,$userId]);
        db()->prepare('INSERT INTO palle_subscriptions(endpoint_hash,user_id,payload) VALUES(?,?,?)')->execute([$hash,$userId,json_encode($data,JSON_THROW_ON_ERROR)]);sendJson(['ok'=>true]);
    }
    if($action==='subscription'&&$method==='DELETE'){$data=inputJson();db()->prepare('DELETE FROM palle_subscriptions WHERE endpoint_hash=? AND user_id=?')->execute([hash('sha256',$data['endpoint']??''),$userId]);sendJson(['ok'=>true]);}
    sendJson(['error'=>'Unbekannter Aufruf.'],404);
} catch(InvalidArgumentException $e){sendJson(['error'=>$e->getMessage()],422);} catch(Throwable $e){error_log('Palle: '.$e->getMessage());sendJson(['error'=>is_file(dirname(__DIR__).'/config.php')?'Serverfehler. Bitte Serverprotokoll prüfen.':'Palle ist noch nicht eingerichtet. Bitte config.php und Datenbank installieren.'],503);}
