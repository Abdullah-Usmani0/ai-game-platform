Write content/crops.json: version 1 and the crops the farm grows, three or four of them, in the order the seed shop shows them. The farmer starts each season with seeds of the first.

Each crop:
- id: a short lowercase id (moonmelon). name: what the player reads on the shop card and beside the seed in hand, at most 10 letters (Moon melon).
- seedPrice: gold a seed (the shop sells packs). sellPrice: gold a harvest, paid the night it is shipped.
- growDays: watered nights from sowing to ripe. A crop sown on the first morning is ripe growDays mornings later, so in a season of D days it must take at most D - 1. regrowDays (leave it out for most crops): the plant stays after a harvest and bears again every regrowDays watered nights.
- look.shape: root (a bulb swelling under a tuft of leaves: turnips, radishes, glowing bulbs), leafy (a head of leaves: lettuce, cabbage, herbs), tall (a stalk with cobs or a flower head: corn, sunflowers, reeds) or bush (fruit on a shrub: berries, tomatoes, melons). look.color: the colour of what it bears, as #rrggbb, one that reads on green leaves and brown soil.

What makes a good table:
- The first crop is cheap and quick (one to three days): the starter seeds pay for the first trip to the shop.
- Every crop pays in a season: sown on the first day it earns more than its seeds. A dearer seed earns more for each day it grows, so saving up for it is worth it, and no crop is worse than another in every way (dearer seeds, a lower price and slower too).
- A crop that bears again costs more up front and pays over many harvests: it rewards sowing it early.
- Different shapes, or clearly different colours where two share a shape, so the field reads at a glance.
- Names and colours come from the game's world (a moon garden grows moon melons and starfruit, not lettuce); the shapes are the four above.
