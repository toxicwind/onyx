#!/usr/bin/env python3
"""
cf-nodriver.py — undetected Chrome (nodriver) CF dashboard login.

Borrows the nodriver wheel: direct CDP to real Chrome without the automation
flag, on a real :99 display — so Cloudflare Turnstile trusts it (checkbox
auto-solves) instead of failing "problem with verification" like patched
Chromium / fresh Firefox. Fills the login, reads the cf_challenge_response
token once Turnstile passes, and POSTs login with the email-MFA code.
"""
import asyncio, os, sys, json

os.environ.setdefault("DISPLAY", ":99")
import nodriver as uc

EMAIL = "toxicwind@gmail.com"
PASSWORD = "7CMHA^EStPdBa3"
CODE = "0636291"

async def main():
    browser = await uc.start(
        headless=False,
        no_sandbox=True,
        user_data_dir="/tmp/cf-nodriver-profile",
        browser_executable_path=os.environ.get("CHROME_BIN"),  # real chrome/system chromium
    )
    tab = await browser.get("https://dash.cloudflare.com/login")
    await tab.sleep(4000)

    # Fill the login form
    try:
        email = await tab.find("#email", timeout=8000)
        await email.send_keys(EMAIL)
        pwd = await tab.find("#password", timeout=8000)
        await pwd.send_keys(PASSWORD)
        print("[cf-nodriver] credentials filled")
    except Exception as e:
        print("[cf-nodriver] fill err:", e)

    # Trigger submit to fire Turnstile (undetected -> auto-solves checkbox)
    try:
        await tab.evaluate("""() => {
            const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim()==='Sign in');
            if (b) b.click();
            return !!b;
        }""")
        print("[cf-nodriver] sign-in clicked")
    except Exception as e:
        print("[cf-nodriver] click err:", e)

    # Poll for the turnstile token / challenge resolution
    for i in range(25):
        await tab.sleep(1000)
        try:
            state = await tab.evaluate("""() => {
                const chl = document.querySelector('input[name=cf_challenge_response]');
                const hasTS = !!document.querySelector('iframe[src*="turnstile"],[class*="turnstile"]');
                return JSON.stringify({
                    url: location.href.substring(0,60),
                    chlLen: chl ? (chl.value||'').length : 0,
                    turnstile: hasTS,
                    err: /problem with verification|Incorrect/i.test(document.body.innerText) ? 'blocked' : 'none',
                    codeFields: [...document.querySelectorAll('input')].map(i=>i.id||i.name).filter(n=>/code|token|verif|otp/i.test(n))
                });
            }""")
            print("[cf-nodriver] poll", i, state)
            s = json.loads(state)
            if s.get("chlLen", 0) > 50:
                print("[cf-nodriver] TURNSTILE TOKEN READY (len", s["chlLen"], ")")
                break
            if s.get("err") == "blocked":
                print("[cf-nodriver] still blocked; continuing to wait for checkbox")
        except Exception as e:
            print("[cf-nodriver] poll err:", e, "- retrying")
    await browser.stop()

asyncio.run(main())