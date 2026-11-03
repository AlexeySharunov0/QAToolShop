# reports - как читать отчёт

Здесь лежит результат **финального** прогона, соответствующий последнему коммиту
с кодом тестов.

| Что | Где |
|---|---|
| HTML-отчёт Playwright | `html/index.html` - открыть `npx playwright show-report reports/html` или просто открыть файл в браузере |
| Машинный результат прогона | `results.json` |
| Trace упавших тестов | `traces/*.zip` - открыть `npx playwright show-trace reports/traces/<файл>.zip` |
| Скриншоты | `screenshots/` |
| Ответы API и протоколы ручных проверок | `evidence/` |

## Итог прогона

```
24 теста: 19 passed, 5 expected failures, 0 unexpected, 0 flaky
длительность: ~23 секунды
```

**5 «ожидаемых падений» - это не поломанные тесты, а дефекты продукта.**
Каждый такой тест помечен в коде `test.fail()` и проверяет поведение, которого
продукт сейчас не обеспечивает. Playwright считает ожидаемое падение успехом,
поэтому в `results.json` вы увидите `"expected": 24, "unexpected": 0` - это
нормальный итог, а не «всё зелёное». В HTML-отчёте такие тесты помечены ✘ и
имеют статус *expected*.

| Тест | Дефект | Что происходит на самом деле |
|---|---|---|
| `api/known-defects.spec.ts` › BUG-01 a product with zero stock cannot be ordered | BUG-01 | товар с остатком 0 добавляется в корзину (200) и заказывается (201) |
| `api/known-defects.spec.ts` › BUG-02 cart quantity is limited by available stock | BUG-02 | 26 шт. при остатке 25 принимаются, остаток уходит в минус |
| `api/known-defects.spec.ts` › BUG-03 an empty cart cannot be turned into an order | BUG-03 | пустая корзина - заказ на 0.00 (201) |
| `api/known-defects.spec.ts` › BUG-04 another customer's cart cannot be consumed | BUG-04 | чужой `cart_id` - заказ создаётся (201) |
| `ui/known-defects.spec.ts` › BUG-05 one click on "Confirm" places the order | BUG-05 | заказ создаётся только вторым нажатием Confirm |

Остальные 19 тестов проходят: это критический путь, корзина, каталог, доступ и
валидация.

## Что смотреть в trace

Trace - это запись действий браузера/запросов с таймлайном, DOM-снимками и
ответами сети. Клиент API построен на фикстуре `request`, поэтому в trace
API-тестов видны и запросы, и ответы:

- `BUG-01-out-of-stock-order.zip` - `POST /carts/{id}` и `POST /invoices` с
  успешными кодами для товара с остатком 0;
- `BUG-02-oversell.zip` - добавление 26 единиц и создание заказа;
- `BUG-03-empty-cart-order.zip` - заказ из пустой корзины;
- `BUG-04-cart-ownership.zip` - заказ из чужой корзины;
- `BUG-05-confirm-two-clicks.zip` - после первого клика Confirm нет
  `POST /invoices`, в сети только `POST /payment/check`.

## Скриншоты

- `BUG-01-out-of-stock-product-page.png` - карточка «Long Nose Pliers»:
  «Out of stock», кнопка «Add to cart» заблокирована.
- `BUG-05-after-first-click.png` - состояние после одного нажатия Confirm:
  «Payment was successful», подтверждения заказа нет.

## Ответы API и ручные проверки

- `evidence/BUG-01.json` … `BUG-06.json` - реальные ответы API на шаги
  воспроизведения (коды, тела, номера счетов, суммы).
- `evidence/BUG-02-stock.txt` - остаток `-1` после заказа 26 единиц при остатке 25.
- `evidence/in_stock-divergence.txt` - расхождение `in_stock` между списком и
  карточкой (TC-26).
- `evidence/account-lockout.txt` - блокировка после трёх неудачных входов (TC-30).

## Соответствие отчёта коду

Отчёт снят с коммита, в котором лежит этот файл, и с версии приложения
`9e7736c` (тег `2.5`, `SPRINT=sprint5`). Если менять код тестов, отчёт нужно
перегенерировать: `npx playwright test`.
