#!/usr/bin/env python3
"""Private operations dashboard. Python stdlib only; no bundled business data."""
import base64,hashlib,hmac,json,os,secrets,tempfile,threading,time
from collections import deque
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit
PASSWORD=os.environ.get('DASH_PASSWORD','');SALT=os.environ.get('DASH_SESSION_SALT','');TOKEN=os.environ.get('DASH_PUSH_TOKEN','')
if not all((PASSWORD,SALT,TOKEN)):raise SystemExit('DASH_PASSWORD, DASH_SESSION_SALT und DASH_PUSH_TOKEN müssen gesetzt sein.')
KEY=hashlib.scrypt(PASSWORD.encode(),salt=('dm-overview-session\0'+SALT).encode(),n=2**14,r=8,p=1,dklen=32);AGE=14*86400
STATIC=Path(__file__).parent/'static';LOCK=threading.RLock();FAILURES={};SNAPSHOT={}
MAX_BODY=8*1024*1024
DATA=Path(os.environ.get('DASH_DATA_DIR','/data'))
try:
 DATA.mkdir(parents=True,exist_ok=True)
 with tempfile.TemporaryFile(dir=DATA):pass
except OSError:
 DATA=Path(tempfile.gettempdir())/'dm-overview';DATA.mkdir(parents=True,exist_ok=True,mode=0o700)
FILE=DATA/'snapshot.json'
try:
 SNAPSHOT=json.loads(FILE.read_text())
 if not isinstance(SNAPSHOT,dict):SNAPSHOT={}
except (OSError,ValueError):pass
LOGIN='''<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Privater Überblick</title><link rel="stylesheet" href="/login.css"><main><h1>Privater Überblick</h1><p>Bitte Zugangscode eingeben.</p><form method="post" action="/login"><input id="pw" type="text" class="masked" name="dm-overview-access-code" aria-label="Zugangscode" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" data-form-type="other" data-1p-ignore data-lpignore="true" data-bwignore required><button>Anmelden</button></form></main></html>'''
CSS='body{font:18px system-ui;background:#101827;color:#eef3fc;margin:0}main{max-width:420px;margin:15vh auto;padding:24px}input,button{box-sizing:border-box;width:100%;font:inherit;padding:14px;margin:8px 0;border-radius:10px}button{background:#70d5c4;border:0}.masked{-webkit-text-security:disc;text-security:disc;letter-spacing:.12em}'
def signed_session():
 payload=f'{int(time.time())+AGE}:{secrets.token_hex(16)}'.encode();body=base64.urlsafe_b64encode(payload).decode().rstrip('=');return body+'.'+hmac.new(KEY,body.encode(),hashlib.sha256).hexdigest()
def valid_session(value):
 try:
  body,sig=value.split('.');want=hmac.new(KEY,body.encode(),hashlib.sha256).hexdigest()
  if not hmac.compare_digest(sig,want):return False
  expiry=int(base64.urlsafe_b64decode(body+'='*(-len(body)%4)).decode().split(':')[0]);return time.time()<expiry<=time.time()+AGE+60
 except (ValueError,UnicodeError):return False
class Handler(BaseHTTPRequestHandler):
 server_version='Overview';sys_version='';timeout=15
 def log_message(self,fmt,*args):pass # Never log credentials, headers or snapshot content.
 def send(self,status,body=b'',ctype='text/plain; charset=utf-8',headers=None):
  if isinstance(body,str):body=body.encode()
  self.send_response(status)
  for k,v in {'Content-Type':ctype,'Content-Length':str(len(body)),'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','X-Frame-Options':'DENY','Strict-Transport-Security':'max-age=31536000','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'",**(headers or {})}.items():self.send_header(k,v)
  self.end_headers();self.wfile.write(body)
 def authorized(self):
  try:
   c=SimpleCookie();c.load(self.headers.get('Cookie',''));return 'dm_session' in c and valid_session(c['dm_session'].value)
  except Exception:return False
 def read_body(self,limit):
  try:n=int(self.headers.get('Content-Length','-1'))
  except ValueError:raise ValueError('Ungültige Länge')
  if n<0 or n>limit:raise ValueError('Anfrage zu groß oder ohne Länge')
  self.connection.settimeout(15);return self.rfile.read(n)
 def same_origin(self):
  origin=self.headers.get('Origin')
  return not origin or urlsplit(origin).netloc==self.headers.get('Host')
 def do_GET(self):
  path=urlsplit(self.path).path
  if path=='/healthz':return self.send(200,'ok' if SNAPSHOT else 'ok empty') # tells the collector to re-push after a redeploy; no data
  if path=='/login.css':return self.send(200,CSS,'text/css; charset=utf-8')
  if not self.authorized():return self.send(200,LOGIN,'text/html; charset=utf-8') if path=='/' else self.send(401,'Bitte anmelden.')
  if path=='/api/data':
   with LOCK:body=json.dumps(SNAPSHOT,ensure_ascii=False,allow_nan=False)
   return self.send(200,body,'application/json; charset=utf-8')
  files={'/':'index.html','/app.js':'app.js','/style.css':'style.css'}
  if path in files:
   f=STATIC/files[path];ctype={'.html':'text/html','.js':'text/javascript','.css':'text/css'}[f.suffix]
   return self.send(200,f.read_bytes(),ctype+'; charset=utf-8')
  self.send(404,'Nicht gefunden.')
 def do_POST(self):
  from urllib.parse import parse_qs
  path=urlsplit(self.path).path
  try:
   if path=='/login':
    if not self.same_origin():return self.send(403,'Ursprung nicht erlaubt.')
    # Peer IP only: never trust a client-supplied X-Forwarded-For header.
    # Behind the proxy every peer is the proxy, so the limiter is effectively global. A correct password therefore
    # always succeeds (no lockout DoS); only wrong guesses are limited (5 per 10 min) and slowed down.
    body=parse_qs(self.read_body(4096).decode());guess=body.get('dm-overview-access-code',[''])[0]
    ok=hmac.compare_digest(guess.encode(),PASSWORD.encode())
    ip=self.client_address[0];now=time.monotonic()
    with LOCK:
     for old in list(FAILURES):
      if not FAILURES[old] or FAILURES[old][-1]<=now-600:del FAILURES[old]
     attempts=FAILURES.setdefault(ip,deque())
     while attempts and attempts[0]<=now-600:attempts.popleft()
     if not ok:attempts.append(now)
     n=len(attempts)
    if not ok:
     time.sleep(min(2.0,0.25*n))
     if n>5:return self.send(429,'Zu viele Versuche. Bitte später erneut versuchen.',headers={'Retry-After':'600'})
     return self.send(401,'Zugangscode ungültig.')
    return self.send(303,headers={'Location':'/','Set-Cookie':f'dm_session={signed_session()}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age={AGE}'})
   if path=='/logout':
    if not self.same_origin():return self.send(403,'Ursprung nicht erlaubt.')
    return self.send(303,headers={'Location':'/','Set-Cookie':'dm_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0'})
   if path=='/api/ingest':
    auth=self.headers.get('Authorization','')
    if not hmac.compare_digest(auth.encode(),('Bearer '+TOKEN).encode()):return self.send(401,'Nicht autorisiert.')
    value=json.loads(self.read_body(MAX_BODY),parse_constant=lambda s: (_ for _ in ()).throw(ValueError('Ungültige Zahl')))
    if not isinstance(value,dict) or not isinstance(value.get('as_of'),str):return self.send(400,'Snapshot und as_of fehlen.')
    global SNAPSHOT
    body=json.dumps(value,ensure_ascii=False,allow_nan=False)
    with LOCK:
     if isinstance(SNAPSHOT.get('as_of'),str) and value['as_of']<SNAPSHOT['as_of']:return self.send(409,'Älterer Stand abgelehnt.')
     # Atomic private persistence; keep the old snapshot if the write fails.
     fd,name=tempfile.mkstemp(dir=DATA,prefix='.snapshot-')
     try:
      with os.fdopen(fd,'w') as f:f.write(body)
      os.replace(name,FILE);SNAPSHOT=value
     finally:
      if os.path.exists(name):os.unlink(name)
    return self.send(200,'ok')
   self.send(404,'Nicht gefunden.')
  except (ValueError,UnicodeError,RecursionError):self.send(400,'Ungültige Anfrage.')
  except (OSError,TimeoutError):self.send(503,'Speichern oder Lesen derzeit nicht möglich.')
if __name__=='__main__':
 server=ThreadingHTTPServer((os.environ.get('DASH_BIND','0.0.0.0'),int(os.environ.get('PORT','8080'))),Handler);server.daemon_threads=True;server.serve_forever()
