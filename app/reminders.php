<?php
declare(strict_types=1);
function reminderMessages(array $state,DateTimeImmutable $now,string $baseUrl): array {
 $berlin=$now->setTimezone(new DateTimeZone('Europe/Berlin'));$today=$berlin->format('Y-m-d');$hour=(int)$berlin->format('G');$messages=[];
 if(in_array($hour,[9,16],true)){
  $tasks=array_filter($state['tasks'],fn($t)=>empty($t['completedAt'])&&$t['due']<=$today);
  if(count($tasks))$messages[]=['key'=>'tasks:'.$today.':'.$hour,'title'=>'Palle · Aufgaben warten','body'=>count($tasks).' fällige oder überfällige Aufgabe(n). Ein Blick ins Lager lohnt sich.','url'=>$baseUrl.'/#tasks','tag'=>'palle-tasks'];
 }
 foreach($state['shifts'] as $s){if(empty($s['end'])&&$now->getTimestamp()>=strtotime($s['start'])+21600)$messages[]=['key'=>'shift:'.$s['id'].':6h','title'=>'Palle · Noch im Einsatz?','body'=>'Sechs Stunden seit „Kommen“. Noch da oder Ausstempeln vergessen?','url'=>$baseUrl.'/#shifts','tag'=>'palle-shift'];}
 return $messages;
}
