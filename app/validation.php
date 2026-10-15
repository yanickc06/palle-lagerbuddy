<?php
declare(strict_types=1);
require_once __DIR__ . '/bootstrap.php';
function validateState(array $s, string $userId): void {
    $cats=['Licht','Ton','Video','Rigging','Strom','Zubehör','Specialeffects'];
    $types=['Funktionsprüfung','Reinigung','Reparatur','Wartung','Aufladen','Sonstiges'];
    $conditions=['Einsatzbereit','Prüfung offen','Defekt','In Reparatur','Außer Betrieb'];
    foreach (['devices','works','tasks','shifts','templates'] as $kind) {
        must(isset($s[$kind]) && is_array($s[$kind]) && array_is_list($s[$kind]) && count($s[$kind])<=30000, 'Ungültige Liste: '.$kind);
        $ids=[];
        foreach ($s[$kind] as $entity) { must(is_array($entity)&&validId($entity['id']??null), 'Ungültige ID.');must(!isset($ids[$entity['id']]),'Doppelte ID.');$ids[$entity['id']]=true; }
    }
    $deviceIds=array_column($s['devices'],'id');$shiftIds=array_column($s['shifts'],'id');$taskIds=array_column($s['tasks'],'id');$barcodes=[];$photoIds=[];
    foreach($s['devices'] as $d){
        textField($d,'name',500,true);textField($d,'barcode',250,true);foreach(['manufacturer','inventory','location'] as $key)textField($d,$key);
        must(in_array($d['category']??'', $cats,true),'Unbekannte Kategorie.');must(in_array($d['condition']??'', $conditions,true),'Unbekannter Zustand.');
        must(!in_array($d['barcode'],$barcodes,true),'Ein Barcode gehört bereits zu einem anderen Gerät.');$barcodes[]=$d['barcode'];
        if(!empty($d['photoId']))$photoIds[]=$d['photoId'];
    }
    $ranges=[];$open=0;
    foreach($s['shifts'] as $shift){
        $start=timestamp($shift['start']??null);$end=empty($shift['end'])?PHP_INT_MAX:timestamp($shift['end']);
        must($end>$start&&$start<=time()+60&&($end===PHP_INT_MAX||$end<=time()+60),'Ungültige Schichtzeiten.');
        if($end===PHP_INT_MAX)$open++;
        must(is_array($shift['pauses']??null)&&array_is_list($shift['pauses']),'Pausenliste fehlt.');$previous=$start;
        foreach($shift['pauses'] as $i=>$p){$ps=timestamp($p['start']??null);$pe=empty($p['end'])?$end:timestamp($p['end']);must($ps>=$previous&&$ps>=$start&&$pe>$ps&&$pe<=$end,'Pausen überlappen oder liegen außerhalb der Schicht.');must(!empty($p['end'])||($end===PHP_INT_MAX&&$i===count($shift['pauses'])-1),'Eine abgeschlossene Schicht hat eine offene Pause.');$previous=$pe;}
        foreach($ranges as [$rs,$re])must(!($start<$re&&$rs<$end),'Schichten überschneiden sich.');$ranges[]=[$start,$end];
    }
    must($open<=1,'Es darf nur eine Schicht gleichzeitig laufen.');
    foreach($s['tasks'] as $t){
        textField($t,'title',500,true);textField($t,'notes',10000);must(($t['deviceId']??null)===null||($t['deviceId']??null)===''||in_array($t['deviceId'], $deviceIds,true),'Aufgabe verweist auf unbekanntes Gerät.');must(in_array($t['type']??'', $types,true),'Unbekannte Tätigkeit.');
        must(is_string($t['due']??null)&&(bool)preg_match('/^\d{4}-\d{2}-\d{2}$/D',$t['due']),'Ungültiger Termin.');
        must((new DateTimeImmutable($t['due']))->format('Y-m-d')===$t['due'],'Ungültiges Kalenderdatum.');
        must(is_int($t['repeatDays']??null)&&$t['repeatDays']>=0&&$t['repeatDays']<=3650,'Ungültige Wiederholung.');if(!empty($t['completedAt']))timestamp($t['completedAt']);
    }
    foreach($s['templates'] as $t){textField($t,'name',500,true);must(in_array($t['category']??'', $cats,true),'Unbekannte Kategorie.');must(is_array($t['items']??null)&&array_is_list($t['items'])&&count($t['items'])>0&&count($t['items'])<=200,'Ungültige Prüfliste.');foreach($t['items'] as $label)must(is_string($label)&&trim($label)!==''&&mb_strlen($label)<=1000,'Ungültiger Prüfpunkt.');}
    foreach($s['works'] as $w){
        must(is_array($w['deviceIds']??null)&&array_is_list($w['deviceIds']),'Geräte fehlen in der Dokumentation.');
        if(isset($w['title']))textField($w,'title',500,true);
        if(!$w['deviceIds']){ $task=array_values(array_filter($s['tasks'],fn($t)=>$t['id']===($w['taskId']??null)))[0]??null;must($task&&!empty($w['title']),'Gerätelose Dokumentation benötigt eine allgemeine Aufgabe.'); }
        foreach($w['deviceIds'] as $d)must(in_array($d,$deviceIds,true),'Dokumentation verweist auf unbekanntes Gerät.');
        must(in_array($w['type']??'', $types,true),'Unbekannte Tätigkeit.');must(in_array($w['status']??'', ['open','completed'],true),'Ungültiger Dokumentationszustand.');
        $start=timestamp($w['startedAt']??null);if($w['status']==='completed')must(timestamp($w['completedAt']??null)>=$start,'Ungültiger Abschluss.');else must(empty($w['completedAt']),'Offene Dokumentation mit Abschlussdatum.');
        must(empty($w['shiftId'])||in_array($w['shiftId'],$shiftIds,true),'Unbekannte Schichtzuordnung.');must(empty($w['taskId'])||in_array($w['taskId'],$taskIds,true),'Unbekannte Aufgabe.');
        if(isset($w['draftText']))textField($w,'draftText',20000);
        must(is_array($w['events']??null)&&array_is_list($w['events'])&&count($w['events'])<=10000,'Ungültiger Verlauf.');
        $eventIds=[];
        foreach($w['events'] as $event){must(validId($event['id']??null)&&!in_array($event['id'],$eventIds,true),'Ungültige Verlaufs-ID.');$eventIds[]=$event['id'];timestamp($event['at']??null);textField($event,'text',20000);must(is_array($event['photoIds']??null)&&array_is_list($event['photoIds']),'Ungültige Fotoliste.');foreach($event['photoIds'] as $pid)$photoIds[]=$pid;}
        must(is_array($w['checklist']??null)&&array_is_list($w['checklist'])&&count($w['checklist'])<=200,'Ungültige Prüfung.');$failed=false;
        foreach($w['checklist'] as $p){textField($p,'label',1000,true);textField($p,'note',10000);must(in_array($p['result']??'', ['','ok','fail','na'],true),'Ungültiges Prüfergebnis.');if($p['result']==='fail')$failed=true;if($w['status']==='completed')must($p['result']!=='','Nicht alle Prüfpunkte sind bewertet.');}
        if($w['status']==='completed'){must(in_array($w['result']??'', ['In Ordnung','Fehler festgestellt','Nicht bewertet'],true),'Abschlussergebnis fehlt.');must(!$failed||$w['result']==='Fehler festgestellt','Fehlgeschlagene Prüfpunkte erfordern ein Fehlerergebnis.');}
    }
    foreach(array_unique($photoIds) as $pid){must(validId($pid),'Ungültige Foto-ID.');$q=db()->prepare('SELECT user_id FROM palle_photos WHERE id=?');$q->execute([$pid]);must($q->fetchColumn()===$userId,'Ein Foto wurde noch nicht hochgeladen oder gehört nicht zu diesem Konto.');}
}
