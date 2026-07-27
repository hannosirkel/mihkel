# Salmon monitor

`Estonian Salmon Price Monitor` (`C1cswl6I7htHr8UQ`) is an active n8n workflow.
It runs daily at `07:00 UTC`. Mihkel invokes its authenticated, fixed webhook
when a directly addressed message is exactly `n8n salmon` (case-insensitive,
with surrounding whitespace ignored).

The implementation and operational notes are in
`workflows/estonian-salmon-price-monitor/README.md`. Coop is excluded by
explicit community decision; the enabled retailer set is Selver, Rimi,
Barbora/Maxima, and Kaupmees. Selver uses
`http://192.168.21.1:3128`.
