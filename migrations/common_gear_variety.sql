insert into public.item_definitions(key,name,icon,rarity,kind,slot,description,mechanics,transferable,active) values
('watchkeepers-cap','Watchkeeper’s Cap','🪖','common','gear','head','A sturdy cap for the road.','{"defense":1}',true,true),
('leather-coif','Leather Coif','🪖','common','gear','head','Supple leather with a reinforced brow.','{"defense":2}',true,true),
('travelers-tunic','Traveler’s Tunic','🧥','common','gear','chest','A comfortable tunic with close-woven cloth.','{"defense":2}',true,true),
('padded-vest','Padded Vest','🧥','common','gear','chest','Quilted padding for everyday adventures.','{"defense":2}',true,true),
('work-gloves','Work Gloves','🧤','common','gear','hands','Good grip for honest work.','{"defense":1}',true,true),
('training-wraps','Training Wraps','🧤','common','gear','hands','Simple wraps for a focused training session.','{"training_xp_pct":2}',true,true),
('sturdy-trousers','Sturdy Trousers','👖','common','gear','legs','Hard-wearing trousers with reinforced seams.','{"defense":2}',true,true),
('roadwalkers-boots','Roadwalker’s Boots','🥾','common','gear','feet','Broken-in boots ready for another mile.','{"defense":1}',true,true),
('soft-leather-boots','Soft Leather Boots','🥾','common','gear','feet','Light footwear for wandering off the usual road.','{"exploration_xp_pct":2}',true,true),
('practice-sword','Practice Sword','⚔️','common','gear','main_hand','A blunt blade for learning the basics.','{"defense":1}',true,true),
('oaken-buckler','Oaken Buckler','🛡️','common','gear','off_hand','A small wooden shield with a stout leather strap.','{"defense":2}',true,true),
('lucky-pebble','Lucky Pebble','🪨','common','gear','charm','A smooth river stone kept for good luck.','{"fortune":1}',true,true),
('travelers-token','Traveler’s Token','🪙','common','gear','relic2','A keepsake from the first road out of home.','{"defense":1}',true,true) on conflict(key) do nothing;
