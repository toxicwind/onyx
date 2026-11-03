#!/usr/bin/env python3
"""cf-nd-min.py — single clean nodriver run against real Chrome, print JSON result."""
import asyncio, os, sys, json
os.environ.setdefault("DISPLAY", ":99")

import nodriver as uc

EMAIL = "toxicwind@gmail.com"
PASSWORD = "7CMHA^EStPdBa3"
CODE = "0636291"

async def main():
    # Single clean profile
    import shutil
    shutil.rmtree("/tmp/cf-nd-clean", ignore_errors=True)
    browser = await uc.start(
        headless=False,
        no_sandbox=True,
        user_data_dir="/tmp/cf-nd-clean",
        browser_executable_path="/opt/google/chrome/chrome",
    )
    tab = await browser.get("https://dash.cloudflare.com/login")
    await tab.sleep(4000)

    # Fill
    try:
        await (await tab.find("#email", timeout=10000)).send_keys(EMAIL)
        await (await tab.find("#password", timeout=10000)).send_keys(PASSWORD)
        print(json.dumps({"stage":"filled"}))
    except Exception as e:
        print(json.dumps({"stage":"fill_err","err":str(e)[:150]})); return

    # Submit (triggers turnstile)
    try:
        await tab.evaluate("""() => {
            const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Sign in');
            if(b){b.click();return true} return false;
        }""")
        print(json.dumps({"stage":"submitted"}))
    except Exception as e:
        print(json.dumps({"stage":"submit_err","err":str(e)[:150]})); return

    # Poll for turnstile token / challenge resolution
    for i in range(20):
        await tab.sleep(1000)
        st = await tab.evaluate("""() => {
            const chl=document.querySelector('input[name=cf_challenge_response]');
            return JSON.stringify({
                url: location.href.substring(0,60),
                chlLen: chl&&chl.value?chl.value.length:0,
                turnstile: !!document.querySelector('iframe[src*="turnstile"],[class*="turnstile"]'),
                err: /problem with verification/i.test(document.body.innerText)?'blocked':'none',
                codeFields:[...document.querySelectorAll('input')].map(i=>i.id||i.name).filter(n=>/code|token|verif|otp/i.test(n))
            });
        }""")
        print(json.dumps({"poll":i,"state":json.loads(st)}))
        s=json.loads(st)
        if s.get("chlLen",0)>50:
            print(json.dumps({"token_ready":True,"len":s["chlLen"]}))
            break
    try:
        await browser.stop()
    except Exception: pass

asyncio.run(main())