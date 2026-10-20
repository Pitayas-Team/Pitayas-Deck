#!/usr/bin/env python3
"""Wirtualna klawiatura Pitaya Deck (Linux, /dev/uinput) — działa na Waylandzie i X11.

Czyta polecenia JSON (jedno na linię) ze standardowego wejścia:
  {"combo": ["ctrl", "shift", "m"]}   naciśnij razem, puść w odwrotnej kolejności
  {"tap": "playpause"}                pojedynczy klawisz
Odpowiada linią "ok" albo "error: …". Na starcie wypisuje "ready" albo "error: …".
Wymaga prawa zapisu do /dev/uinput (np. reguła udev z uaccess).
"""
import fcntl
import json
import os
import struct
import sys
import time

KEYS = {
    'esc': 1, 'escape': 1, '1': 2, '2': 3, '3': 4, '4': 5, '5': 6, '6': 7, '7': 8, '8': 9, '9': 10, '0': 11,
    'minus': 12, '-': 12, 'equal': 13, '=': 13, 'backspace': 14, 'tab': 15,
    'q': 16, 'w': 17, 'e': 18, 'r': 19, 't': 20, 'y': 21, 'u': 22, 'i': 23, 'o': 24, 'p': 25,
    '[': 26, ']': 27, 'enter': 28, 'return': 28, 'ctrl': 29, 'control': 29, 'lctrl': 29,
    'a': 30, 's': 31, 'd': 32, 'f': 33, 'g': 34, 'h': 35, 'j': 36, 'k': 37, 'l': 38,
    ';': 39, "'": 40, '`': 41, 'grave': 41, 'shift': 42, 'lshift': 42, '\\': 43,
    'z': 44, 'x': 45, 'c': 46, 'v': 47, 'b': 48, 'n': 49, 'm': 50, ',': 51, 'comma': 51, '.': 52, 'dot': 52, '/': 53, 'slash': 53,
    'rshift': 54, 'alt': 56, 'lalt': 56, 'space': 57, 'capslock': 58,
    'f1': 59, 'f2': 60, 'f3': 61, 'f4': 62, 'f5': 63, 'f6': 64, 'f7': 65, 'f8': 66, 'f9': 67, 'f10': 68,
    'numlock': 69, 'scrolllock': 70, 'f11': 87, 'f12': 88,
    'rctrl': 97, 'printscreen': 99, 'print': 99, 'altgr': 100, 'ralt': 100,
    'home': 102, 'up': 103, 'pageup': 104, 'left': 105, 'right': 106, 'end': 107, 'down': 108, 'pagedown': 109,
    'insert': 110, 'delete': 111, 'del': 111,
    'mute': 113, 'volumedown': 114, 'volumeup': 115, 'pause': 119,
    'super': 125, 'meta': 125, 'win': 125, 'cmd': 125, 'rsuper': 126, 'menu': 127,
    'nextsong': 163, 'next': 163, 'playpause': 164, 'play-pause': 164, 'previoussong': 165, 'previous': 165, 'prev': 165,
    'stopcd': 166, 'stop': 166,
    'f13': 183, 'f14': 184, 'f15': 185, 'f16': 186, 'f17': 187, 'f18': 188, 'f19': 189, 'f20': 190,
    'f21': 191, 'f22': 192, 'f23': 193, 'f24': 194, 'micmute': 248,
}

EV_SYN, EV_KEY, SYN_REPORT = 0, 1, 0
UI_SET_EVBIT = 0x40045564
UI_SET_KEYBIT = 0x40045565
UI_DEV_CREATE = 0x5501
UI_DEV_DESTROY = 0x5502
UI_DEV_SETUP = 0x405C5503   # _IOW('U', 3, struct uinput_setup) — 92 bajty
BUS_VIRTUAL = 0x06
EVENT = 'llHHi'             # struct input_event (64-bit)


def open_device():
    fd = os.open('/dev/uinput', os.O_WRONLY | os.O_NONBLOCK)
    fcntl.ioctl(fd, UI_SET_EVBIT, EV_KEY)
    fcntl.ioctl(fd, UI_SET_EVBIT, EV_SYN)
    for code in sorted(set(KEYS.values())):
        fcntl.ioctl(fd, UI_SET_KEYBIT, code)
    name = b'Pitaya Deck Keyboard'
    try:
        setup = struct.pack('HHHH80sI', BUS_VIRTUAL, 0x1209, 0x7064, 1, name, 0)
        fcntl.ioctl(fd, UI_DEV_SETUP, setup)
    except OSError:
        # Starsze jądra: struct uinput_user_dev zapisywany wprost
        legacy = struct.pack('80sHHHHi' + 'i' * 256, name, BUS_VIRTUAL, 0x1209, 0x7064, 1, 0, *([0] * 256))
        os.write(fd, legacy)
    fcntl.ioctl(fd, UI_DEV_CREATE)
    time.sleep(0.4)   # kompozytor musi zauważyć nowe urządzenie
    return fd


def emit(fd, code, value):
    now = time.time()
    sec, usec = int(now), int((now % 1) * 1e6)
    os.write(fd, struct.pack(EVENT, sec, usec, EV_KEY, code, value))
    os.write(fd, struct.pack(EVENT, sec, usec, EV_SYN, SYN_REPORT, 0))


def code_of(name):
    key = str(name).strip().lower()
    if key not in KEYS:
        raise ValueError(f'nieznany klawisz „{name}”')
    return KEYS[key]


def main():
    try:
        fd = open_device()
    except Exception as err:  # brak uprawnień, brak modułu uinput…
        print(f'error: {err}', flush=True)
        return 1
    print('ready', flush=True)
    try:
        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue
            try:
                cmd = json.loads(line)
                keys = cmd.get('combo') or [cmd.get('tap')]
                codes = [code_of(k) for k in keys if k]
                for c in codes:
                    emit(fd, c, 1)
                    time.sleep(0.012)
                for c in reversed(codes):
                    emit(fd, c, 0)
                    time.sleep(0.012)
                print('ok', flush=True)
            except Exception as err:
                print(f'error: {err}', flush=True)
    finally:
        try:
            fcntl.ioctl(fd, UI_DEV_DESTROY)
        except OSError:
            pass
        os.close(fd)
    return 0


if __name__ == '__main__':
    sys.exit(main())
