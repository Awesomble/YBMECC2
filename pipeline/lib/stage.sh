# Remotion public/ 스테이징 — 엔진(pipeline/motion)은 프로젝트를 모른다. 렌더 직전에 필요한 파일만 모은다.
#   public/brand/    ← resources/brand/
#   public/fonts/    ← resources/fonts/
#   public/project/  ← projects/<p>/output/narration.wav + projects/<p>/assets/audio/*(bgm) + assets/scene/*(로고·사진)
#   src/project.ts   ← 어느 프로젝트를 렌더할지 (생성 파일, gitignore)
# public/ 은 번들마다 통째로 복사되므로 작게 유지한다 (음악·SFX 라이브러리는 넣지 않는다).
stage_project() {   # $1 = 프로젝트 절대경로
  local dir="$1" name motion pub out
  name=$(basename "$dir"); motion="$ABM_ROOT/pipeline/motion"; pub="$motion/public"; out="$dir/output"
  [ -f "$dir/motion/index.ts" ] || { echo "✗ $name 에 motion/index.ts 가 없습니다 — 모션 경로 프로젝트가 아닙니다 (골격: pipeline/templates/motion)"; return 1; }
  mkdir -p "$pub" "$out"
  rsync -a --delete --exclude .DS_Store "$ABM_ROOT/resources/brand/" "$pub/brand/"
  rsync -a --delete --exclude .DS_Store "$ABM_ROOT/resources/fonts/" "$pub/fonts/"
  rm -rf "$pub/project"; mkdir -p "$pub/project"
  if [ -f "$out/narration.wav" ]; then cp "$out/narration.wav" "$pub/project/narration.wav"
  else echo "⚠️ $out/narration.wav 없음 — 먼저 pipeline/narration.sh $name  (없으면 Main.tsx 의 Audio 가 실패한다)"; fi
  # ⚠️ narration.wav 는 예약 파일명이다 — assets 안에 같은 이름이 있으면 정본을 덮어쓴다 (2026-09-08)
  for r in "$dir/assets/audio/narration.wav" "$dir/assets/scene/narration.wav"; do
    [ -f "$r" ] && { echo "✗ $r — narration.wav 는 예약 파일명이다. 다른 이름으로 바꿔라"; return 1; }
  done
  [ -d "$dir/assets/audio" ] && rsync -a --exclude .DS_Store "$dir/assets/audio/" "$pub/project/"
  # 씬이 쓰는 로고·사진 (resources/logos 에서 복사해 온 것). assets/images 는 카드 렌더물이라 스테이징하지 않는다 (수십 MB)
  [ -d "$dir/assets/scene" ] && rsync -a --exclude .DS_Store "$dir/assets/scene/" "$pub/project/"
  printf "// 생성 파일 — pipeline/render.sh · studio.sh 가 쓴다. 손으로 고치지 마라 (gitignore).\nexport {PROJECT} from '../../../projects/%s/motion';\n" "$name" > "$motion/src/project.ts"
  echo "  스테이징 ✔ $name  (public/brand · public/fonts · public/project · src/project.ts)"
}
