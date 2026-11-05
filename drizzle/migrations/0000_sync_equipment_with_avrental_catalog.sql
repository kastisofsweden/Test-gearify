DELETE FROM public.offer_items WHERE equipment_id IS NOT NULL;
DELETE FROM public.equipment;

INSERT INTO public.equipment (name, category, description, daily_price, image_url, tag, is_active, sort_order) VALUES
('75″ LED-TV', 'Skärmar', 'Professionell 75-tums LED-skärm för mässmontrar, keynote-scener och företagsevent. Endast skärm.', 639, 'https://avrental.se/wp-content/uploads/2026/08/led-tv-1024x819.png', 'Skärm', true, 1),
('65″ LED-TV', 'Skärmar', 'Den mest bokade storleken. 65-tums LED-skärm för konferensrum, montrar och utbildningslokaler.', 456, 'https://avrental.se/wp-content/uploads/2026/08/led-tv-1024x819.png', 'Populärast', true, 2),
('55″ LED-TV', 'Skärmar', '55-tums LED-skärm för grupprum, registrering och skyltning.', 390, 'https://avrental.se/wp-content/uploads/2026/08/led-tv-1024x819.png', 'Skärm', true, 3),
('Högtalarstativ', 'Stativ och fästen', 'Höjdjusterbart golvstativ för skärm eller högtalare.', 7, 'https://avrental.se/wp-content/uploads/2026/08/speaker-stand-1024x640.jpg', NULL, true, 4),
('VESA-fäste', 'Stativ och fästen', 'VESA-adapterplatta för montering av skärm på golvstativ.', 38, 'https://avrental.se/wp-content/uploads/2026/08/vesa-mount.png', NULL, true, 5),
('Stativkjol', 'Tillbehör', 'Måttanpassad svart stativkjol som döljer stativ och kablage.', 3, 'https://avrental.se/wp-content/uploads/2026/08/speaker-stand-skirt-1024x1024.jpg', NULL, true, 6),
('Gitarrstativ', 'Stativ och fästen', 'Fällbart A-stativ för gitarr, för scen och backline.', 11, 'https://avrental.se/wp-content/uploads/2026/08/guitar-stand-folding-a-frame.jpg', NULL, true, 7),
('65″ TV med stativ och kjol', 'Paket', 'Komplett paket: 65-tums skärm, golvstativ och måttanpassad stativkjol.', 504, 'https://avrental.se/wp-content/uploads/2026/08/65-tv-kit-1024x572.jpg', 'Populärast', true, 8),
('75″ TV med stativ och kjol', 'Paket', 'Komplett paket: 75-tums skärm, golvstativ och måttanpassad stativkjol.', 687, 'https://avrental.se/wp-content/uploads/2026/08/75-tv-kit-1024x572.jpg', 'Paket', true, 9),
('55″ TV med stativ och kjol', 'Paket', 'Komplett paket: 55-tums skärm, golvstativ och måttanpassad stativkjol.', 438, 'https://avrental.se/wp-content/uploads/2026/08/55-tv-kit-1024x572.jpg', 'Paket', true, 10),
('Confidence monitor 55″ på lågt stativ', 'Paket', 'Confidence monitor: 55-tums skärm på lågt golvstativ med kjol, riktad mot talaren.', 400, 'https://avrental.se/wp-content/uploads/2026/08/confidence-monitor-stage-floor-stand.jpg', 'Paket', true, 11),
('Confidence monitor 65″ på lågt stativ', 'Paket', 'Confidence monitor: 65-tums skärm på lågt golvstativ med kjol, riktad mot talaren.', 467, 'https://avrental.se/wp-content/uploads/2026/08/confidence-monitor-stage-floor-stand.jpg', 'Paket', true, 12);
