<?php
// ======== CONFIGUREER DIT DEEL NAAR JOUW SERVER =========
$db_host = ' 127.0.0.1';
$db_user = 'awarmn_robweerts';
$db_pass = 'm69AC6vvksJMLqAmqpRX';
$db_name = 'awarmn_feedback'; // of wat jij gebruikt
$db_port = 8889;
// ========================================================

// CORS toestaan (veilig genoeg voor je eigen domein)
header('Access-Control-Allow-Origin: https://awarmnote.com');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json');

// OPTIONS preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { exit; }

// Alleen POST toestaan
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
  http_response_code(405);
  echo json_encode(['ok' => false, 'error' => 'Method not allowed']);
  exit;
}

// JSON uitlezen
$data = json_decode(file_get_contents('php://input'), true);
if (!$data) {
  http_response_code(400);
  echo json_encode(['ok' => false, 'error' => 'Bad JSON']);
  exit;
}

$rating = isset($data['rating']) ? intval($data['rating']) : null;
$text   = substr(trim($data['text'] ?? ''), 0, 2000);
$lang   = substr($data['lang'] ?? 'nl', 0, 8);
$ua     = substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 1000);

// DB-verbinding
$conn = new mysqli($db_host, $db_user, $db_pass, $db_name);
if ($conn->connect_error) {
  http_response_code(500);
  echo json_encode(['ok' => false, 'error' => 'DB connection failed']);
  exit;
}

// Prepared statement tegen SQL-injectie
$stmt = $conn->prepare("INSERT INTO feedback_log (rating, text, lang, ua) VALUES (?, ?, ?, ?)");
$stmt->bind_param("isss", $rating, $text, $lang, $ua);
$ok = $stmt->execute();

if ($ok) {
  echo json_encode(['ok' => true]);
} else {
  http_response_code(500);
  echo json_encode(['ok' => false, 'error' => 'DB insert failed']);
}

$stmt->close();
$conn->close();
