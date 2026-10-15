<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli')exit(1);
require dirname(__DIR__).'/vendor/autoload.php';
$keys=Minishlink\WebPush\VAPID::createVapidKeys();
echo "In config.php eintragen (privaten Schlüssel geheim halten):\n";
echo "vapid_public: ".$keys['publicKey']."\nvapid_private: ".$keys['privateKey']."\n";
