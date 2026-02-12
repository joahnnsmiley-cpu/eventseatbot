# Table Rendering Rules

Исправление проблемы «стол больше чем на подложке»:

- **Remove any min-width or min-height constraints** — на `.table-wrapper` и `.table-shape` задать `min-width: 0; min-height: 0`.
- **Remove padding inside table container** — на `.table-wrapper` и `.table-shape` задать `padding: 0`.
- **Ensure table size equals exactly calculated width/height** — использовать `box-sizing: border-box` на `.table-shape`, чтобы border не добавлялся к размеру.
