<?php
// Isolated transport double; copied only into the temporary test server.
namespace Minishlink\WebPush;
class Subscription { public static function create($data){return $data;} }
class WebPush {
 public function __construct(...$args){}
 public function sendOneNotification($subscription,$payload,$options){
  file_put_contents(dirname(__DIR__).'/push-test-payload.json',json_encode(['subscription'=>$subscription,'message'=>json_decode($payload,true),'options'=>$options]));
  return new Report(str_contains($subscription['endpoint'],'expired'));
 }
}
class Report {
 public function __construct(private bool $expired){}
 public function isSuccess(){return !$this->expired;}
 public function isSubscriptionExpired(){return $this->expired;}
 public function getReason(){return 'test transport';}
}
