#!/usr/bin/env python3
"""
宠物图片批量生成工具 - 使用装饰变化区分等级
"""

import argparse
import json
import os
import sys
import time
import requests
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Optional


MODELS = {
    "flux": "black-forest-labs/FLUX.1-schnell",
    "flux-dev": "black-forest-labs/FLUX.1-dev", 
    "flux-pro": "black-forest-labs/FLUX.1-pro",
}

OUTPUT_DIR = Path("/root/.openclaw/workspace/projects/class-pet-garden/public/pets")

PETS = {
    "cat": {
        "name": "小猫",
        "base": "cute fluffy cat with big round eyes, pink nose, soft orange and white fur, fluffy tail",
    }
}

# 装饰变化定义 - 用装饰替代体型变化
DECORATIONS = {
    1: {"item": "tiny pink ribbon", "effect": "soft pastel colors", "bg": "peaceful meadow with small flowers"},
    2: {"item": "small bell collar", "effect": "gentle glow", "bg": "colorful garden with butterflies"},
    3: {"item": "shiny star collar", "effect": "subtle magical aura", "bg": "enchanted forest with glowing mushrooms"},
    4: {"item": "golden necklace with small gem", "effect": "soft golden aura", "bg": "ancient forest with waterfall"},
    5: {"item": "crown with small jewels", "effect": "glowing particles around", "bg": "mountain peak above clouds"},
    6: {"item": "golden crown with wings", "effect": "golden halo and floating particles", "bg": "floating islands in golden clouds"},
    7: {"item": "regal crown with large wings", "effect": "intense golden glow, majestic aura", "bg": "celestial temple in clouds with aurora"},
    8: {"item": "divine crown with angel wings, floating above ground", "effect": "radiant golden light beams, divine halo, sacred symbols floating", "bg": "cosmic realm with stars and nebula, heavenly gates"},
}

STYLE = "flat cartoon style, kawaii, chibi proportions, cute and friendly, big round eyes with highlights, soft rounded shapes, smooth outlines, vibrant colors, masterpiece, standing pose, front view, happy expression"
NEGATIVE = "ugly, deformed, noisy, blurry, realistic, scary, dark, text, watermark, bad anatomy"

def build_prompt(pet_id: str, level: int) -> str:
    pet = PETS[pet_id]
    dec = DECORATIONS[level]
    
    return f"{pet['base']}, wearing {dec['item']}, {dec['effect']}, {STYLE}, {dec['bg']}, 8k, highly detailed"

def get_api_key():
    with open("/root/.openclaw/openclaw.json") as f:
        config = json.load(f)
        return config.get('models', {}).get('providers', {}).get('siliconflow', {}).get('apiKey', '')

def generate(prompt: str, model: str = "flux-dev"):
    api_key = get_api_key()
    url = "https://api.siliconflow.cn/v1/images/generations"
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    payload = {
        "model": MODELS[model],
        "prompt": prompt,
        "negative_prompt": NEGATIVE,
        "image_size": "512x512",
        "num_images": 1,
        "seed": int(time.time()) % 1000000
    }
    resp = requests.post(url, headers=headers, json=payload, timeout=120)
    return resp.json()

def download(url: str, path: Path):
    r = requests.get(url, stream=True)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, 'wb') as f:
        for chunk in r.iter_content(chunk_size=8192):
            f.write(chunk)
    return True

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--pet", default="cat", help="宠物")
    parser.add_argument("--level", type=int, help="等级")
    parser.add_argument("--all", action="store_true", help="生成所有等级")
    args = parser.parse_args()
    
    if args.all:
        print(f"🎨 生成 {args.pet} 所有等级 (1-8)...\n")
        for lvl in range(1, 9):
            prompt = build_prompt(args.pet, lvl)
            print(f"  Lv.{lvl}: {prompt[:60]}...")
            result = generate(prompt, "flux-dev")
            if 'images' in result:
                url = result['images'][0]['url']
                path = OUTPUT_DIR / args.pet / f"lv{lvl}.png"
                download(url, path)
                print(f"  ✅ 已保存: lv{lvl}.png")
            else:
                print(f"  ❌ 失败: {result.get('error', 'unknown')}")
            time.sleep(1)
        print(f"\n✅ 全部完成！")
    elif args.pet and args.level:
        prompt = build_prompt(args.pet, args.level)
        print(f"🎨 生成 {args.pet} Lv.{args.level}...")
        result = generate(prompt, "flux-dev")
        if 'images' in result:
            url = result['images'][0]['url']
            path = OUTPUT_DIR / args.pet / f"lv{args.level}.png"
            download(url, path)
            print(f"✅ 已保存: {path}")

if __name__ == "__main__":
    main()
