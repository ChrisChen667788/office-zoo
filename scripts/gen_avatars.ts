import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename2 = typeof __filename !== 'undefined' ? __filename : fileURLToPath(import.meta.url);
const __dirname2 = path.dirname(__filename2);
const AVATAR_DIR = path.resolve(__dirname2, '../packages/server/public/avatars');

if (!fs.existsSync(AVATAR_DIR)) fs.mkdirSync(AVATAR_DIR, { recursive: true });

const ROLE_ART_DETAILS: Record<string, { animal: string; outfit: string; prop: string; bgColor: string }> = {
  villager_cat:   { animal: 'orange tabby kitten', outfit: 'wearing a tiny blue scarf', prop: 'carrying a task clipboard', bgColor: '#FFE4B5' },
  detective_cat:  { animal: 'grey British Shorthair kitten', outfit: 'wearing a tiny detective hat and coat', prop: 'holding a magnifying glass', bgColor: '#B0C4DE' },
  medic_cat:      { animal: 'white Persian kitten', outfit: 'wearing a tiny nurse cap with red cross', prop: 'holding a first aid kit', bgColor: '#FFB6C1' },
  engineer_cat:   { animal: 'calico kitten', outfit: 'wearing a tiny yellow hard hat and tool belt', prop: 'holding a wrench', bgColor: '#FFA500' },
  bodyguard_cat:  { animal: 'Maine Coon kitten', outfit: 'wearing tiny sunglasses and a black suit', prop: 'holding a shield badge', bgColor: '#4682B4' },
  medium_cat:     { animal: 'Siamese kitten with mystical glowing eyes', outfit: 'wearing a purple crystal pendant', prop: 'floating crystal ball nearby', bgColor: '#9370DB' },
  vigilante_cat:  { animal: 'Bengal kitten', outfit: 'wearing tiny binoculars around neck', prop: 'holding a notebook and pencil', bgColor: '#90EE90' },
  adventurer_cat: { animal: 'Ragdoll kitten', outfit: 'wearing a tiny explorer hat and vest', prop: 'holding a compass', bgColor: '#DEB887' },
  mimic_cat:      { animal: 'Russian Blue kitten', outfit: 'wearing a theatrical half-mask on face', prop: 'holding a mirror', bgColor: '#DDA0DD' },
  politician_cat: { animal: 'Birman kitten', outfit: 'wearing a tiny top hat and monocle', prop: 'holding a scroll', bgColor: '#CD853F' },
  killer_dog:     { animal: 'fierce Husky puppy', outfit: 'wearing a tiny dark hoodie', prop: 'with glowing red eyes and shadowy claws', bgColor: '#4A4A5A' },
  spy_dog:        { animal: 'sneaky Shiba Inu puppy', outfit: 'wearing a spy trench coat and dark sunglasses', prop: 'holding a hidden camera', bgColor: '#2F4F4F' },
  morphing_dog:   { animal: 'fox-like puppy with color-shifting fur', outfit: 'with a shape-shifting aura effect', prop: 'holding a glowing transformation gem', bgColor: '#8B5E3C' },
  ninja_dog:      { animal: 'black Shiba puppy', outfit: 'wearing a ninja headband and mask', prop: 'holding a shuriken star', bgColor: '#1C1C3A' },
  hypnotist_dog:  { animal: 'Corgi puppy with spiral hypnotic eyes', outfit: 'wearing a mystical cloak', prop: 'swinging a pendulum', bgColor: '#4B0082' },
  bomber_dog:     { animal: 'Bulldog puppy', outfit: 'wearing a tiny dynamite vest', prop: 'holding a cartoon bomb with lit fuse', bgColor: '#8B2222' },
  assassin_dog:   { animal: 'sleek Greyhound puppy', outfit: 'wearing a black assassin cloak', prop: 'holding a gleaming dagger', bgColor: '#2C2C3C' },
  silencer_dog:   { animal: 'fluffy Samoyed puppy', outfit: 'wearing a muzzle', prop: 'making a shushing gesture with paw', bgColor: '#483D8B' },
  jester:         { animal: 'chaotic fluffy Pomeranian puppy', outfit: 'wearing a colorful jester hat with bells', prop: 'juggling colorful balls', bgColor: '#FF69B4' },
  phantom:        { animal: 'ghostly translucent hamster', outfit: 'wearing a phantom cape', prop: 'with floating lantern', bgColor: '#E0E0FF' },
  pigeon:         { animal: 'round chubby pigeon bird', outfit: 'wearing a tiny messenger bag', prop: 'holding a letter in beak', bgColor: '#87CEEB' },
  lone_wolf:      { animal: 'lone wolf cub with a scar across eye', outfit: 'wearing a tattered wanderer scarf', prop: 'howling at moonlight', bgColor: '#4A4A6A' },
  lover:          { animal: 'adorable chinchilla', outfit: 'wearing a heart locket necklace', prop: 'holding a heart-shaped balloon', bgColor: '#FFB6C1' },
};

const API_KEY = process.env.QINGYUN_API_KEY || '';
const BASE_URL = process.env.QINGYUN_BASE_URL || 'https://api.qingyuntop.top/v1';

function buildPrompt(d: typeof ROLE_ART_DETAILS[string]): string {
  return `A single adorable round furball ${d.animal} character, game avatar portrait. ${d.outfit}, ${d.prop}. Art style: extremely cute chibi illustration, perfectly round plump body shape, very big sparkling eyes with light reflections, tiny stub limbs, rosy pink blush cheeks, soft fluffy fur texture, thick black outlines, kawaii Japanese mascot style, clean vector-like rendering, solid ${d.bgColor} background. High quality, centered composition, game character icon, no text.`;
}

async function generateOne(role: string): Promise<boolean> {
  const filePath = path.join(AVATAR_DIR, `${role}.png`);
  if (fs.existsSync(filePath)) {
    console.log(`[SKIP] ${role} - already exists`);
    return true;
  }

  const details = ROLE_ART_DETAILS[role];
  if (!details) return false;

  const prompt = buildPrompt(details);
  console.log(`[GEN] ${role} - generating...`);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    const response = await fetch(`${BASE_URL}/images/generations`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-image-1', prompt, n: 1, size: '1024x1024', quality: 'high' }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      console.error(`[FAIL] ${role} - API error ${response.status}`);
      return false;
    }

    const data = await response.json();
    const imageData = data.data?.[0];
    if (!imageData?.b64_json) {
      console.error(`[FAIL] ${role} - no b64_json in response`);
      return false;
    }

    const buffer = Buffer.from(imageData.b64_json, 'base64');
    fs.writeFileSync(filePath, buffer);
    console.log(`[OK] ${role} - ${(buffer.length / 1024).toFixed(0)}KB saved`);
    return true;
  } catch (err: any) {
    console.error(`[FAIL] ${role} - ${err.message}`);
    return false;
  }
}

async function main() {
  const roles = Object.keys(ROLE_ART_DETAILS);
  let done = 0, failed = 0;

  for (const role of roles) {
    const ok = await generateOne(role);
    if (ok) done++; else failed++;
    // Rate limit: wait 2s between API calls
    await new Promise(r => setTimeout(r, 2000));
  }

  console.log(`\n=== DONE: ${done} success, ${failed} failed ===`);
  console.log(`Avatar directory: ${AVATAR_DIR}`);
  console.log(`Files: ${fs.readdirSync(AVATAR_DIR).filter(f => f.endsWith('.png')).length} PNGs`);
}

main().catch(console.error);
