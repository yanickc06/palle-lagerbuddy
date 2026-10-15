<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli')exit(1);
require_once dirname(__DIR__).'/app/bootstrap.php';
require_once dirname(__DIR__).'/app/reminders.php';
try{
 $lock=fopen(storage().'/reminders.lock','c');if(!flock($lock,LOCK_EX|LOCK_NB))exit(0);
 $c=config();if(empty($c['vapid_public'])||empty($c['vapid_private']))throw new RuntimeException('VAPID-Schlüssel fehlen.');
 require dirname(__DIR__).'/vendor/autoload.php';
 $state=json_decode(db()->query('SELECT payload FROM palle_state WHERE id=1')->fetchColumn(),true,512,JSON_THROW_ON_ERROR);
 $messages=reminderMessages($state,new DateTimeImmutable('now'),rtrim($c['app_url'],'/'));
 $subscriptions=db()->query('SELECT * FROM palle_subscriptions')->fetchAll();
 foreach($subscriptions as $row){
  $data=json_decode($row['payload'],true,512,JSON_THROW_ON_ERROR);if(!isHttpsEndpoint($data['endpoint']))continue;
  foreach($messages as $message){
   $receipt=hash('sha256',$row['endpoint_hash'].':'.$message['key']);$q=db()->prepare('SELECT receipt_key FROM palle_deliveries WHERE receipt_key=?');$q->execute([$receipt]);if($q->fetch())continue;
   $push=new Minishlink\WebPush\WebPush(['VAPID'=>['subject'=>$c['vapid_subject'],'publicKey'=>$c['vapid_public'],'privateKey'=>$c['vapid_private']]]);
   $report=$push->sendOneNotification(Minishlink\WebPush\Subscription::create($data),json_encode($message,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),['TTL'=>3600]);
   if($report->isSuccess())db()->prepare('INSERT INTO palle_deliveries(receipt_key,delivered_at) VALUES(?,?)')->execute([$receipt,gmdate('c')]);
   elseif($report->isSubscriptionExpired()){db()->prepare('DELETE FROM palle_subscriptions WHERE endpoint_hash=?')->execute([$row['endpoint_hash']]);break;}
   else error_log('Palle push delivery failed: '.$report->getReason());
  }
 }
 flock($lock,LOCK_UN);fclose($lock);
}catch(Throwable $e){fwrite(STDERR,$e->getMessage()."\n");exit(1);}
