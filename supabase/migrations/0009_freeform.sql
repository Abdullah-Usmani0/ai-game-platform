-- Freeform games: composed from the systems of several curated genres on one of them as a base. Stored, listed and
-- ranked like any game; the genre column says freeform and the bundle's design files name the base.
alter type genre add value if not exists 'freeform';
