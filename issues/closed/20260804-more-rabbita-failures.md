# Rabbitaの追加実例からfailureを発見し最小化する

Status: closed
Model: GPT-5.6 Thinking
Created: 2026-08-04
Updated: 2026-08-04
Branch: main

## 概要

Rabbita公式exampleを追加調査し、TODOより異なる境界条件を持つSokoban、subscriptions、WebSocketをvendorして、実在するfailureをproperty-based model explorationで発見・縮約した。

## 結果

- Sokoban: malformed timeline inputがcursor 0へrewindする。最小traceは`Move(Up) -> JumpTo("not-a-number")`。
- subscriptions: pause後に到着したqueued tickがcounterをincrementする。最小traceは`ToggleTicker -> Tick`。
- WebSocket: closing中もdisconnectが有効で、二重close requestを受理する。最小traceは`ClientConnectRequested -> ClientDisconnectRequested -> ClientDisconnectRequested`。

## 探索規模

- Sokoban: 255 states、1,163 transitions
- subscriptions: 640 states、1,718 transitions
- WebSocket: 800 states、4,428 transitions

## 受け入れ条件

- [x] upstream source、stylesheet、revision、hash、licenseを保存する。
- [x] native targetで決定的に探索できるadapterを追加する。
- [x] 各failureを最小traceへ縮約する。
- [x] property名とtraceのexact signatureをCLIで検証する。
- [x] `demo run all`へ統合する。
- [x] format、check、test、artifact、determinismを検証する。
