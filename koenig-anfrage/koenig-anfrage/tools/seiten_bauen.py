# Baut src/anfrage.html aus der Vorschau-Datei (Formular) und legt den Seitenrahmen an.
import sys, re, pathlib
src = pathlib.Path(sys.argv[1]).read_text(encoding='utf-8')
out = pathlib.Path(sys.argv[2])

RESET = ("<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);"
         "padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif}"
         "img{max-width:100%}[hidden]{display:none!important}</style>")

def wrap(head, body):
    return ('<!doctype html>\n<html lang="de">\n<head>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
            '<meta name="robots" content="noindex">\n' + RESET + '\n' + head + '\n</head>\n<body>\n' + body + '\n</body>\n</html>\n')

src = src.replace('<meta name="claude:viewport-fit-sides" content="cover">\n', '')
cut = src.index('</style>') + len('</style>')
head, body = src[:cut], src[cut:]
body = body.replace("var ENDPOINT = '';", "var ENDPOINT = '/api';", 1)
assert "var ENDPOINT = '/api';" in body
out.write_text(wrap(head, body), encoding='utf-8')
print('ok', out, len(out.read_text()))
