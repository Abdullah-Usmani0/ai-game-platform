---
{"title":"Willowbrook Farm","genre":"lifesim","scopeTier":"medium","pillars":["every day ends with something grown","the field is a plan, never a chore","a season pays the patient"],"scope":{"levels":3,"enemies":0,"items":0,"bosses":0},"targets":{"sessionMin":20,"levelTimeS":300,"deathsPerLevel":0},"verbs":["move","work","choose seed"],"feedbackEvents":[{"event":"pickup","channels":["particle","sfx"]},{"event":"level_complete","channels":["sfx","particle"]}]}
---
## Concept
Three seasons on a small farm by a willow creek. The farmer wakes on the door step at six, tills and sows the field, waters every planting, ships the harvest in the bin by the house and buys better seeds at the stall on the east fence, then goes to bed before two. The buyer wants a purse of gold by the end of each season: a little in spring, more by autumn.

## Pillars
1. Every day ends with something grown: watered plantings grow overnight, and the morning card says what last night's shipping paid.
2. The field is a plan, never a chore: quick parsnips grow a small purse, kale earns a plot more, blueberries bear every day once ripe, sunflowers pay best but take five days; energy and the clock decide how much of the field a day can work.
3. A season pays the patient: seeds sown in the last days cannot ripen in time, and the biggest harvests come at the end.

## Core loop
30 seconds: walk the rows, till a plot, sow the seed in hand, water it. 5 minutes: a season of seven days: harvest what ripened overnight, ship it, buy seeds with yesterday's pay, sow and water, sleep. Session (20 min): make every season's quota, each a little harder than the last.

## Progression
Each season starts fresh on its own farm: spring has a field of ten plots near the house, summer eighteen, autumn twenty-four in two fields with a long walk to the stall. The quota rises from about half of what an ideal farmer earns to about two thirds. Target 300 seconds a season.

## Scope
Three seasons, four crops (content/crops.json), no enemies, items or bosses (tier medium).

## Feedback
Every listed event produces its channels at runtime through the feedback binder: pickup (a harvest) bursts and sounds, level_complete celebrates. The farm's own events (till, plant, water, harvest, ship, payout, buy, sleep, morning, dusk, a job that cannot be done) each have a sound and their own particles.
