#!/usr/bin/env bash
# Drives the Headcount demo on a booted emulator: installs both apps, authenticates the mock wallet,
# records the screen, runs the Maestro flows, funds the wallet between them, and collects evidence.
# Required env: HEADCOUNT_APK, WALLET_APK, CI_FUNDER_KEYPAIR. Optional: ANDROID_SERIAL, DEMO_SIZE, FUND_CMD.
# SMOKE=1 exercises only the emulator, PIN, wallet and recorder (no Headcount APK, no funding).
set -uo pipefail
cd "$(dirname "$0")/.."
[ -n "${ANDROID_HOME:-}" ] && export PATH="$ANDROID_HOME/platform-tools:$PATH"

OUT=demo/out
PIN=1234
FUND_CMD=${FUND_CMD:-node demo/fund.mjs}
SIZE=${DEMO_SIZE:-720x1600}
DENSITY=${DEMO_DENSITY:-280}
UDID=${ANDROID_SERIAL:+--udid $ANDROID_SERIAL}
export MAESTRO_CLI_NO_ANALYTICS=1 MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED=true
mkdir -p "$OUT/logs"

FAILED=0
note() { echo "[demo] $*"; }
snap() { adb exec-out screencap -p > "$OUT/$1.png" 2>/dev/null || true; }
dump_ui() { maestro $UDID hierarchy > "$OUT/logs/$1-hierarchy.json" 2>&1 || true; }

run_flow() { # name file [maestro args...]
  local name=$1 file=$2
  shift 2
  note "flow $name"
  maestro $UDID test "$@" --test-output-dir "$OUT/maestro-$name" --debug-output "$OUT/maestro-$name-debug" \
    --format junit --output "$OUT/maestro-$name.xml" "$file" 2>&1 | tee "$OUT/logs/maestro-$name.log"
  local rc=${PIPESTATUS[0]}
  if [ "$rc" -ne 0 ]; then
    note "flow $name FAILED rc=$rc"
    snap "fail-$name"
    dump_ui "fail-$name"
    FAILED=1
  fi
  return "$rc"
}

# ---- device setup
note "device: $(adb shell getprop ro.product.model | tr -d '\r') api $(adb shell getprop ro.build.version.sdk | tr -d '\r')"
adb shell input keyevent 82
adb shell svc power stayon true
adb shell settings put global hide_error_dialogs 1
adb shell settings put secure show_ime_with_hard_keyboard 0
if [ "$SIZE" != native ]; then
  adb shell wm size "$SIZE"
  adb shell wm density "$DENSITY"
fi
adb shell locksettings set-pin "$PIN"
# setting a credential locks the device at once: wake it, open the bouncer, unlock with the PIN
sleep 2
adb shell input keyevent 224
adb shell wm dismiss-keyguard
sleep 2
adb shell input text "$PIN"
sleep 1
adb shell input keyevent 66
sleep 3
snap 00-unlocked
adb shell dumpsys window policy | grep -iE 'showing' | head -3
[ -n "${SMOKE:-}" ] || adb install -r -g "$HEADCOUNT_APK" | tail -1
adb install -r -g "$WALLET_APK" | tail -1
adb shell pm list packages | grep -E 'xyz.headcount.app|com.solana.mwallet' || note "apps missing"
adb shell pm list packages | grep -q com.solana.mwallet || exit 1
adb shell input keyevent 3
sleep 3

# ---- wallet: authenticate once so its key is usable for 15 minutes (the PIN is the device credential)
adb logcat -G 16M
adb logcat -c
run_flow wallet-open demo/wallet-open.yaml
sleep 3
snap 00-pin-prompt
adb shell input text "$PIN"
sleep 1
adb shell input keyevent 66
# the prompt window is FLAG_SECURE, so confirm from the system log: dismissed reason 7 = credential confirmed
AUTH=0
for _ in $(seq 1 45); do
  if adb logcat -d | grep -q 'AuthSession.*Dismissed!.*Reason: 7'; then AUTH=1; break; fi
  sleep 2
done
note "wallet credential confirmed=$AUTH"
[ "$AUTH" = 1 ] || FAILED=1
snap 00-wallet-authenticated

# fallback: if the wallet asks for the device credential again mid-flow, answer it from the system log
adb logcat -T 1 -s AuthController:D | while read -r line; do
  case "$line" in
    *showAuthenticationDialog*)
      note "credential prompt shown again, entering PIN"
      (sleep 4; adb shell input text "$PIN"; adb shell input keyevent 66) &
      ;;
  esac
done &
WATCH=$!

adb shell input keyevent 3
sleep 1

# ---- recording: screenrecord stops at 180 s, so chain files until the flag is removed
adb shell 'touch /sdcard/rec.on; i=1; while [ -f /sdcard/rec.on ]; do screenrecord --bit-rate 8000000 --time-limit 170 /sdcard/demo$i.mp4; i=$((i+1)); done' &
REC=$!
sleep 4
if ! adb shell pidof screenrecord > /dev/null; then note "screenrecord did not start"; FAILED=1; fi

if [ -n "${SMOKE:-}" ]; then
  sleep 6
  note "smoke: recorder ran, stopping"
  ADDR=
else
# ---- headcount: connect the wallet
ADDR=
if run_flow connect demo/headcount-connect.yaml; then
  ADDR=$(adb logcat -d -s MobileWalletAdapterViewModel | grep -o 'add=[1-9A-HJ-NP-Za-km-z]\{32,44\}' | tail -1 | cut -d= -f2)
  if [ -z "$ADDR" ]; then
    ADDR=$(maestro $UDID hierarchy 2>/dev/null | grep -o 'Wallet [1-9A-HJ-NP-Za-km-z]\{32,44\}' | head -1 | cut -d' ' -f2)
  fi
  note "wallet address ${ADDR:-NOT FOUND}"
fi

# ---- fund, then cast
if [ -n "$ADDR" ]; then
  $FUND_CMD "$ADDR" 2>&1 | tee "$OUT/logs/fund.log"
  if [ "${PIPESTATUS[0]}" -eq 0 ]; then
    SHORT="${ADDR:0:4}..${ADDR: -4}"
    run_flow cast demo/headcount-cast.yaml -e SHORT="$SHORT"
  else
    note "funding failed"
    FAILED=1
  fi
else
  FAILED=1
fi
fi

# ---- stop recording, collect
kill "$WATCH" 2> /dev/null
sleep 2
adb shell rm -f /sdcard/rec.on
adb shell pkill -2 -x screenrecord
wait "$REC" 2> /dev/null
sleep 2
for f in $(adb shell ls /sdcard/demo*.mp4 | tr -d '\r'); do adb pull "$f" "$OUT/" > /dev/null; done
adb logcat -d -v time > "$OUT/logs/logcat.txt" 2>&1 || true
ls -la "$OUT"/*.mp4 2> /dev/null || { note "no video pulled"; FAILED=1; }
note "done FAILED=$FAILED"
exit "$FAILED"
