# Arma la página del CRM (versión Claude) a partir de las fuentes.
# Uso: python3 build.py ../diamond-travel-crm.html
import sys, base64, os
aqui = os.path.dirname(os.path.abspath(__file__))
leer = lambda n: open(os.path.join(aqui, n), encoding="utf-8").read()
src, tail, cot = leer("crm-src.html"), leer("tail-new.js"), leer("cotizador.js")
logo = base64.b64encode(open(os.path.join(aqui, "..", "..", "assets", "logo-diamond-travel.png"), "rb").read()).decode()
assert src.count("/*__TAIL__*/") == 1 and src.count("/*__COTIZADOR__*/") == 1
out = src.replace("/*__TAIL__*/", tail).replace("/*__COTIZADOR__*/", cot)
assert out.count("__LOGO_B64__") == 1
out = out.replace("__LOGO_B64__", logo)
open(sys.argv[1], "w", encoding="utf-8").write(out)
print(len(out), "bytes")
