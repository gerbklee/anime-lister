// Auto-tagging for the Eagle export: turns a picture's site tags into tags that
// help when looking for references later, grouped as "Pose: sitting",
// "Angle: from below", "Lighting: backlighting" and so on, plus characters,
// series, artist, size, shape and site. Noise (meta tags like "highres",
// "commentary", "watermark") is dropped.
//
// Tag kinds come from Danbooru (character, series, artist, meta); general tags
// are sorted into groups by the rules below, in order (first match wins).

const set = (...words) => new Set(words);

const DROP = /^(highres|absurdres|incredibly_absurdres|lowres|commentary.*|.*_commentary|.*_request|translated|translation_.*|artist_name|signature|watermark|dated|twitter_username|.*_username|web_address|bad_.*|md5_mismatch|revision|jpeg_artifacts|paid_reward.*|patreon_.*|tagme|text_focus|copyright_name|character_name|logo|english_text|japanese_text|chinese_text|korean_text|speech_bubble|.*users入り|.*user入り|オリジナル)$/;

const GROUPS = [
  ['People', set('solo', '1girl', '2girls', '3girls', '4girls', '5girls', '6+girls', '1boy', '2boys', '3boys', '4boys', '5boys', '6+boys', 'multiple_girls', 'multiple_boys', '1other', 'multiple_others', 'couple', 'group', 'crowd', 'no_humans', 'male_focus', 'female_focus', 'solo_focus', 'yuri', 'yaoi', 'hetero')],
  ['Framing', set('full_body', 'upper_body', 'lower_body', 'cowboy_shot', 'portrait', 'close-up', 'head_out_of_frame', 'feet_out_of_frame', 'out_of_frame', 'face', 'wide_shot', 'very_wide_shot', 'hand_focus', 'foot_focus', 'back_focus', 'eye_focus', 'cropped_legs', 'cropped_torso', 'bust')],
  ['Angle', set('from_above', 'from_below', 'from_side', 'from_behind', 'from_outside', 'dutch_angle', 'foreshortening', 'pov', 'profile', 'perspective', 'fisheye', 'upside-down', 'straight-on', 'three-quarter_view', 'sideways', 'isometric', 'aerial_view', 'vanishing_point', 'pov_hands')],
  ['Medium', /_\(medium\)$|^(sketch|lineart|monochrome|greyscale|spot_color|traditional_media|oil_painting|pixel_art|3d|chibi|realistic|photorealistic|official_art|concept_art|reference_sheet|character_sheet|model_sheet|turnaround|expression_chart|multiple_views|variations|color_guide|partially_colored|flat_color|cel_shading|anime_coloring|unfinished|work_in_progress|study|rough_sketch|thick_lineart|no_lineart|textured|painterly|line_art|halftone|cover|cover_page|album_cover|poster_\(medium\)|key_visual|promotional_art|game_cg|novel_illustration)$/],
  ['Colour', /_theme$|^(limited_palette|colorful|pastel_colors|muted_color|vibrant_colors|high_saturation|desaturated|sepia|gradient|rainbow|neon_palette|two-tone|black_and_white)$/],
  ['Lighting', /_lighting$|^(backlighting|sunlight|dappled_sunlight|light_rays|sunbeam|crepuscular_rays|lens_flare|glowing|glow|glowing_eyes|silhouette|chiaroscuro|high_contrast|shadow|light_particles|bloom|night|sunset|sunrise|twilight|evening|dusk|moonlight|neon_lights|dark|darkness|spotlight|candlelight|firelight|reflection|caustics|volumetric_lighting|light)$/],
  ['Expression', /^(smile|grin|open_mouth|closed_mouth|closed_eyes|one_eye_closed|half-closed_eyes|blush|crying|tears|streaming_tears|angry|annoyed|surprised|frown|pout|expressionless|smirk|laughing|sad|scared|embarrassed|serious|determined|confused|sleepy|sleeping|nervous|excited|:d|:o|;d|:3|:p|;\)|tongue_out|tongue|clenched_teeth|teeth|sweat|sweatdrop|parted_lips|wink|evil_smile|crazy_smile|light_blush|full-face_blush|looking_at_viewer|looking_away|looking_down|looking_up|looking_to_the_side|looking_afar|looking_at_another|eye_contact|staring|glaring|shaded_face)$/],
  ['Props', /^holding_|^(sword|katana|weapon|gun|handgun|rifle|staff|spear|polearm|scythe|dagger|knife|bow_\(weapon\)|arrow_\(projectile\)|shield|book|umbrella|phone|cellphone|smartphone|instrument|guitar|electric_guitar|piano|violin|microphone|cup|mug|teacup|food|fruit|flower|bouquet|bag|backpack|lantern|candle|card|playing_card|camera|bottle|can|cigarette|pipe|fan|paper_fan|stuffed_toy|stuffed_animal|teddy_bear|ball|chair|table|desk|bed|bicycle|motorcycle|car|vehicle|mecha|robot|wand|magic_circle|orb|crystal|tarot|chess|game_controller|headset|laptop|computer|sheath|scabbard|armlet)$/],
  ['Effects', /^(motion_blur|motion_lines|speed_lines|wind|floating_hair|floating|petals|falling_petals|cherry_blossoms|sparkle|sparkles|particles|smoke|fire|flame|flames|magic|explosion|splashing|water_drop|bubble|bubbles|depth_of_field|blurry|blurry_background|blurry_foreground|bokeh|chromatic_aberration|film_grain|lightning|electricity|aura|energy|feathers|falling_leaves|leaf|snowing|rain|confetti|light_trail|afterimage|shockwave|dust|debris)$/],
  ['Background', /_background$|^(scenery|landscape|cityscape|indoors|outdoors|sky|cloud|clouds|cloudy_sky|blue_sky|night_sky|starry_sky|star_\(sky\)|space|forest|tree|nature|ocean|sea|beach|water|river|lake|snow|city|street|road|building|skyscraper|room|bedroom|classroom|cafe|restaurant|library|shrine|temple|castle|church|ruins|mountain|field|flower_field|grass|garden|park|underwater|fantasy|architecture|window|stairs|bridge|train_station|alley|rooftop|balcony|desert|cave|bamboo_forest|east_asian_architecture|horizon|sun|moon|full_moon|meadow|waterfall|town|village|interior|kitchen|bathroom|office|stage|throne|battlefield|cyberpunk|sci-fi|post-apocalypse|steampunk)$/],
  ['Hair', /^(?!hair_(ornament|ribbon|bow|flower|tie|band|clip|between_eyes|over_one_eye|intakes)$).*(_hair$|^hair_)|^(ponytail|high_ponytail|low_ponytail|side_ponytail|twintails|low_twintails|braid|single_braid|twin_braids|french_braid|crown_braid|bangs|blunt_bangs|swept_bangs|parted_bangs|ahoge|hair_bun|double_bun|single_hair_bun|sidelocks|drill_hair|twin_drills|bob_cut|hime_cut|undercut|bald|hair_between_eyes|hair_over_one_eye|hair_intakes|messy_hair|wavy_hair|curly_hair|straight_hair|spiked_hair|multicolored_hair|streaked_hair|gradient_hair|two-tone_hair|colored_inner_hair)$/],
  ['Eyes & face', /_eyes$|^(heterochromia|eyelashes|long_eyelashes|thick_eyebrows|eyebrows_visible_through_hair|slit_pupils|symbol-shaped_pupils|heart-shaped_pupils|fang|fangs|skin_fang|freckles|mole|mole_under_eye|scar|scar_on_face|facial_mark|makeup|lipstick|eyeshadow|eyeliner|whisker_markings|facial_hair|beard|mustache|stubble|glasses|round_eyewear|semi-rimless_eyewear|eyepatch|mask|face_mask|half_mask)$/],
  ['Body', /_ears$|_tail$|(^|_)wings$|_horns?$|^(muscular|muscular_female|muscular_male|abs|toned|tall|short|plump|elf|pointy_ears|halo|demon_girl|demon_boy|angel|vampire|monster_girl|kemonomimi_mode|animal_ears|tail|wings|horns|android|cyborg|mechanical_arms|prosthesis|dark_skin|dark-skinned_female|dark-skinned_male|pale_skin|tan|tattoo|bandages|bandaid|veins|bara|old|old_man|old_woman|mature_female|mature_male)$/],
  ['Pose', /^(arm|arms|hand|hands|leg|legs|knee|knees|finger|fingers|head|foot|feet|thumb|elbow|elbows)_|^(standing|standing_on_one_leg|sitting|kneeling|one_knee|squatting|crouching|lying|on_back|on_stomach|on_side|all_fours|seiza|indian_style|crossed_legs|knees_up|walking|running|jumping|dynamic_pose|fighting_stance|battle_stance|contrapposto|stretching|leaning_forward|leaning_back|leaning|bent_over|looking_back|arms_up|hands_up|arm_up|arms_behind_back|arms_behind_head|crossed_arms|hand_on_own_hip|hands_on_own_hips|hand_on_hip|hand_on_own_face|hand_on_own_chin|hand_on_own_chest|head_tilt|head_rest|spread_arms|outstretched_arm|outstretched_arms|reaching|reaching_towards_viewer|flying|falling|dancing|fighting|attacking|punching|kicking|slashing|aiming|casting_spell|hugging|hug|holding_hands|carrying|princess_carry|piggyback|pointing|pointing_at_viewer|v|double_v|salute|waving|thumbs_up|peace_sign|clenched_hand|clenched_hands|fist|own_hands_together|praying|covering_mouth|finger_to_mouth|shushing|hand_up|hand_in_pocket|hands_in_pockets|adjusting_hair|adjusting_eyewear|tying_hair|sitting_on_chair|on_bed|on_floor|against_wall|wall_slam|back-to-back|selfie|eating|drinking|reading|writing|singing|playing_instrument|cooking|sleeping_upright|yawning|stretched_limbs|legs_up|spread_legs|legs_apart|split|kick|mid-air|midair|twisting_torso|turning_around|walking_away|from_behind_pose|full_body_pose)$/],
  ['Clothing', /(dress|shirt|skirt|jacket|coat|kimono|yukata|hakama|uniform|armor|armour|hoodie|sweater|cardigan|vest|gloves|boots|shoes|sneakers|sandals|heels|hat|cap|beret|cape|cloak|scarf|necktie|bowtie|ribbon|bow|apron|robe|suit|tuxedo|pants|shorts|jeans|thighhighs|pantyhose|socks|kneehighs|leotard|bodysuit|swimsuit|bikini|serafuku|blazer|sailor_collar|collar|sleeves|hood|headphones|earrings|necklace|jewelry|hair_ornament|hairband|hairclip|hair_ribbon|hair_bow|hair_flower|crown|tiara|veil|choker|belt|harness|frills|lace|maid|nurse|witch|gothic|lolita_fashion|china_dress|chinese_clothes|military|police|school|idol|cosplay|casual|formal|sportswear|tank_top|crop_top|turtleneck|overalls|camisole|cheongsam|hanfu|haori|fur_trim|zipper|buttons|pocket|wristband|bracelet|ring|anklet|mittens|bandana|headband|helmet|goggles|scarf|sash|obi|tabi|geta|zouri)/],
];

function groupOf(tag) {
  for (const [name, rule] of GROUPS) {
    if (rule instanceof Set ? rule.has(tag) : rule.test(tag)) return name;
  }
  return null;
}

const titleWords = (s) => s.replace(/\b[a-z]/g, (c) => c.toUpperCase());
const plain = (tag) => tag.replace(/_/g, ' ').trim();
// "gojou_satoru" -> "Gojou Satoru"; "saber_(fate)" keeps its qualifier so it stays unique.
const personName = (tag) => titleWords(plain(tag));
const seriesName = (tag) => titleWords(plain(tag.replace(/_\((series|franchise)\)$/, ''))).replace(/(?<=\s)(No|Wa|Wo|Ga|Ni|De|To|Na|Mo)(?=\s)/g, (w) => w.toLowerCase());

const SITE_NAMES = { danbooru: 'Danbooru', yandere: 'Yande.re', konachan: 'Konachan', gelbooru: 'Gelbooru', zerochan: 'Zerochan', wallhaven: 'Wallhaven', pixiv: 'Pixiv' };

// item: { tags, characters, series, artists, width, height, ai, sources: [{source}] }
// info: Map tag -> { category } from Danbooru (for tags whose kind the site didn't say).
// opts: { style: 'grouped' | 'plain', other: boolean }
function eagleTags(item, info, { style = 'grouped', other = false } = {}) {
  const out = [];
  const add = (group, value) => {
    if (!value) return;
    out.push(style === 'plain' || !group ? value : `${group}: ${value}`);
  };
  const characters = new Set(item.characters ?? []);
  const series = new Set(item.series ?? []);
  const artists = new Set(item.artists ?? []);
  const general = [];
  for (const raw of item.tags ?? []) {
    const t = String(raw).trim();
    if (!t) continue;
    const low = t.toLowerCase().replace(/ /g, '_');
    if (DROP.test(low)) continue;
    const cat = info?.get(low)?.category;
    if (cat === 4) characters.add(low);
    else if (cat === 3) series.add(low);
    else if (cat === 1) artists.add(low);
    else if (cat === 5) continue; // Danbooru meta tags
    else general.push(low);
  }
  for (const c of characters) add('Character', personName(c));
  for (const s of series) add('Series', seriesName(s));
  for (const a of artists) add('Artist', plain(a));
  for (const t of general) {
    const g = groupOf(t);
    if (g) add(g, plain(t).replace(/ theme$/, ''));
    else if (other) add('Tag', plain(t));
  }
  // Derived from the picture itself.
  const w = Number(item.width) || 0;
  const h = Number(item.height) || 0;
  if (w && h) {
    const r = w / h;
    add('Shape', r > 1.05 ? 'landscape' : r < 0.95 ? 'portrait' : 'square');
    const edge = Math.max(w, h);
    add('Size', edge >= 3840 ? '4K+' : edge >= 2000 ? '2K+' : edge >= 1200 ? 'HD' : 'small');
  }
  if (item.ai) add('Medium', 'AI-generated');
  for (const s of item.sources ?? []) add('Site', SITE_NAMES[s.source] ?? s.source);
  return [...new Set(out)];
}

// Eagle's star rating from how popular the picture is on its site (0 = leave unrated).
function starsFor(item) {
  const score = Number(item.score);
  if (!Number.isFinite(score) || score <= 0) return 0;
  const steps = item.source === 'pixiv' ? [300, 1000, 3000, 10000] : item.source === 'wallhaven' ? [50, 200, 800, 3000] : [20, 50, 120, 300];
  return 1 + steps.filter((s) => score >= s).length;
}

module.exports = { eagleTags, starsFor, groupOf, personName, seriesName, plain, SITE_NAMES };
