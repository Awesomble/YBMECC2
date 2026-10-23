# abm3d — Blender 5.2 헤드리스 장면용 공용 도구 (ABMEN 3D 경로, 2026-09-23 도입)
#
# 장면 스크립트가 `import abm3d as T` 로 쓴다. 실행은 pipeline/blender-render.sh 가 한다.
# 규칙 — docs/16-blender.md 에 근거(공식 문서·5.2.2 실측)가 있다
#   1. 모델링은 데이터 API(bmesh)로 한다. bpy.ops.primitive_* · transform_apply 를 쓰지 않는다
#      (transform_apply 기본값은 location/rotation/scale 전부 True — 좌표 이중 적용 사고)
#   2. 부모를 코드로 지정하면 matrix_parent_inverse 가 단위행렬 → 자식 location 은 부모 기준 로컬 좌표다
#   3. 색 = Emission + sRGB→scene linear + view_transform Standard (AgX 기본값은 브랜드 색을 바꾼다)
#      명암은 조명이 아니라 월드 법선·고정 벡터 내적 → Constant 램프 3단 (Shader to RGB 는 광량에 따라 전부 어두워진다)
#   4. 애니메이션: 5.0 에서 action.fcurves 제거 → 채널백으로 접근. 이징을 걸 키를 정확한 경로·인덱스로 못 찾으면 예외
#   5. 카메라 TrackTo 는 축을 명시하고(-Z / UP_Y) 모든 키 구간에서 is_valid 를 확인한다
#   6. 렌더 전 layout_check 로 화면 좌표를 계산해 제목·자막 구역 침범을 숫자로 먼저 잡는다
#   시간은 초로 받는다. 블렌더 k 번 프레임 = 로컬 (k-1)/60 초 = HyperFrames 렌더 0기준 프레임 k-1 (실측 일치)
import bpy, bmesh, math, json, os
from mathutils import Vector, Color, Matrix
from bpy_extras import anim_utils

FPS = 60
W, H = 1080, 1920
HEX = {"navy": "#111B35", "blue": "#304BDA", "cream": "#FFF5DF", "lime": "#C8F477",
       "coral": "#FF996D", "muted": "#9AA6C4", "line": "#2B3A63", "white": "#FFFFFF",
       "cool": "#8196FF", "plan": "#243157"}
LIGHT = Vector((0.45, -0.55, 0.70)).normalized()
OUTLINE = "navy"   # 외곽선 기본색 — 장면에서 T.OUTLINE = "ink" 처럼 바꾼다(ABM). box·cyl 등 line= 인자가 이 색을 쓴다


def lin(h):
    h = HEX.get(h, h).lstrip('#')
    c = Color([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]).from_srgb_to_scene_linear()
    return (c.r, c.g, c.b, 1.0)


def fr(t):
    return round(t * FPS) + 1


def args():
    """blender-render.sh 가 넘기는 인자: --out --anchors [--preview] [--stills t1,t2,…]"""
    import sys
    a = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    get = lambda k, d=None: a[a.index(k) + 1] if k in a else d
    st = get("--stills")
    return {"out": get("--out", "/tmp/abm3d"), "anchors": get("--anchors"), "preview": "--preview" in a,
            "stills": [float(x) for x in st.split(",")] if st else None, "anchors_only": "--anchors-only" in a,
            "review": "--review" in a}


def reset(duration, out_dir, res=(W, H), samples=16, preview=False):
    """duration 초 = round(duration*60) 프레임"""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.resolution_x, sc.render.resolution_y = res
    # 롱폼 묶음 B 확장(08 §4.3): ABM3D_WIDE_W=2280 이면 세로 화각(sensor_fit VERTICAL)은 그대로 두고 가로만 넓혀 렌더한다 — 가운데 1080열은 같은 화소
    if os.environ.get('ABM3D_WIDE_W'): sc.render.resolution_x = int(os.environ['ABM3D_WIDE_W'])
    # 가운데는 원본 webm을 그대로 쓰고 옆 띠만 렌더할 때: ABM3D_BORDER="x0,x1"(0~1 비율) — 그 세로 띠만 잘라 렌더(시간 절약). ABM3D_SAMPLES로 표본 수를 따로 줄 수 있다
    if os.environ.get('ABM3D_BORDER'):
        bx0, bx1 = (float(v) for v in os.environ['ABM3D_BORDER'].split(','))
        sc.render.use_border = True; sc.render.use_crop_to_border = True
        sc.render.border_min_x, sc.render.border_max_x, sc.render.border_min_y, sc.render.border_max_y = bx0, bx1, 0.0, 1.0
    sc.render.fps = FPS
    sc.frame_start, sc.frame_end = 1, max(1, round(duration * FPS))
    sc.render.film_transparent = True
    sc.view_settings.view_transform = 'Standard'
    sc.view_settings.look = 'None'
    sc.render.image_settings.media_type = 'IMAGE'     # 5.0+: file_format 보다 먼저 (EL4CTEO/blender-skills api-changes-5x · 5.2.2 확인)
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'
    sc.render.filepath = os.path.join(out_dir, "f_")
    sc.render.engine = 'BLENDER_EEVEE'          # 5.0+ 식별자. BLENDER_EEVEE_NEXT 는 없다
    sc.eevee.taa_render_samples = int(os.environ.get('ABM3D_SAMPLES') or samples)
    if preview:
        sc.render.resolution_percentage = 50
        sc.frame_step = 6
    assert sc.view_settings.view_transform == 'Standard'
    return sc


# ── 재질 ──────────────────────────────────────────────────────────────
def _nt(name):
    m = bpy.data.materials.new(name)
    if m.node_tree is None: m.use_nodes = True       # 5.0+ 새 재질은 노드 트리가 이미 있다(use_nodes 는 6.0 제거 예정 — 5.2.2 확인)
    nt = m.node_tree; nt.nodes.clear()
    return m, nt, nt.links


def _shade(nt, L, steps):
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    dot = nt.nodes.new('ShaderNodeVectorMath'); dot.operation = 'DOT_PRODUCT'; dot.inputs[1].default_value = LIGHT
    ramp = nt.nodes.new('ShaderNodeValToRGB'); ramp.color_ramp.interpolation = 'CONSTANT'
    el = ramp.color_ramp.elements
    el[0].position, el[0].color = steps[0][0], (steps[0][1],) * 3 + (1,)
    el[1].position, el[1].color = steps[1][0], (steps[1][1],) * 3 + (1,)
    for p, v in steps[2:]:
        e = el.new(p); e.color = (v,) * 3 + (1,)
    L.new(geo.outputs['Normal'], dot.inputs[0]); L.new(dot.outputs['Value'], ramp.inputs[0])
    return ramp.outputs['Color']


FLAT_STEPS = ((0.0, 0.80), (0.35, 0.92), (0.62, 1.0))
LIT = ((0.0, 1.0), (0.5, 1.0))


def flat(name, base="cream", tint=None, img=None, steps=FLAT_STEPS, alpha=None, fade=None):
    """면 방향 3단 명암. tint: 키프레임 가능한 'tint' 값(0→1)으로 base→tint 색 전환. alpha: 'alpha' 값 노드(부분 투명은 BLENDED)
    fade=(z0, z1): 오브젝트 로컬 z0→z1 구간에서 불투명→투명 (다리·기둥처럼 화면 위로 뻗는 부재를 제목 앞에서 지운다)"""
    if fade is not None and alpha is None: alpha = 1.0
    m, nt, L = _nt(name)
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    shade = _shade(nt, L, steps)
    tex = None
    if img:
        tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = bpy.data.images.load(img); tex.interpolation = 'Cubic'
        col = tex.outputs['Color']
    else:
        rgb = nt.nodes.new('ShaderNodeRGB'); rgb.outputs[0].default_value = lin(base); col = rgb.outputs[0]
    if tint:
        tv = nt.nodes.new('ShaderNodeValue'); tv.name = tv.label = 'tint'; tv.outputs[0].default_value = 0.0
        tc = nt.nodes.new('ShaderNodeRGB'); tc.outputs[0].default_value = lin(tint)
        mt = nt.nodes.new('ShaderNodeMix'); mt.data_type = 'RGBA'
        L.new(tv.outputs[0], mt.inputs['Factor']); L.new(col, mt.inputs[6]); L.new(tc.outputs[0], mt.inputs[7])
        col = mt.outputs[2]
    mul = nt.nodes.new('ShaderNodeMix'); mul.data_type = 'RGBA'; mul.blend_type = 'MULTIPLY'
    mul.inputs['Factor'].default_value = 1.0
    L.new(col, mul.inputs[6]); L.new(shade, mul.inputs[7])
    em = nt.nodes.new('ShaderNodeEmission'); L.new(mul.outputs[2], em.inputs[0])
    a_src = tex.outputs['Alpha'] if tex else None
    if alpha is not None or a_src is not None:
        av = nt.nodes.new('ShaderNodeValue'); av.name = av.label = 'alpha'
        av.outputs[0].default_value = 1.0 if alpha is None else alpha
        if a_src is not None:
            am = nt.nodes.new('ShaderNodeMath'); am.operation = 'MULTIPLY'
            L.new(a_src, am.inputs[0]); L.new(av.outputs[0], am.inputs[1]); a_src = am.outputs[0]
        else:
            a_src = av.outputs[0]
        if fade is not None:
            tcn = nt.nodes.new('ShaderNodeTexCoord'); sz = nt.nodes.new('ShaderNodeSeparateXYZ')
            mr = nt.nodes.new('ShaderNodeMapRange'); mr.clamp = True
            mr.inputs['From Min'].default_value, mr.inputs['From Max'].default_value = fade
            mr.inputs['To Min'].default_value, mr.inputs['To Max'].default_value = 1.0, 0.0
            L.new(tcn.outputs['Object'], sz.inputs[0]); L.new(sz.outputs['Z'], mr.inputs['Value'])
            fm = nt.nodes.new('ShaderNodeMath'); fm.operation = 'MULTIPLY'
            L.new(a_src, fm.inputs[0]); L.new(mr.outputs['Result'], fm.inputs[1]); a_src = fm.outputs[0]
        tr = nt.nodes.new('ShaderNodeBsdfTransparent'); ms = nt.nodes.new('ShaderNodeMixShader')
        L.new(a_src, ms.inputs[0]); L.new(tr.outputs[0], ms.inputs[1]); L.new(em.outputs[0], ms.inputs[2])
        L.new(ms.outputs[0], out.inputs[0])
        if alpha is not None:
            m.surface_render_method = 'BLENDED'   # 부분 투명(페이드)은 디더 노이즈 대신 블렌드
    else:
        L.new(em.outputs[0], out.inputs[0])
    return m


# ── 룩 B·C 시험 구현(2026-09-23). 당시 00006은 v7 선호 판정이었다.
#    현행 선택은 docs/16-blender.md §1·§5-1: 도식은 flat(), 표면은 flat(img=…) 등 사진 매핑.
#    아래 함수가 있다는 이유로 전체 장면의 룩을 바꾸지 않는다. mixc는 공용 색 혼합이다.
def mixc(a, b, t):
    """두 색(hex 이름 또는 hex)의 scene-linear 선형 혼합 → RGBA"""
    A, B = lin(a), lin(b)
    return tuple(A[i] * (1 - t) + B[i] * t for i in range(3)) + (1.0,)


def styl(name, base="cream", shadow=None, top=None, tint=None, alpha=None, rim=0.0,
         shadow_mix=0.38, top_mix=0.32, cuts=(0.18, 0.5)):
    """B 룩(2026-09-23 고도화): 외곽선 없이 **색이 바뀌는 명암** — Kurzgesagt 식.
    빛을 받는 면 = base(hex 그대로), 그늘 면 = base→shadow(기본 navy) 쪽으로 hue 이동, 윗면(법선 z↑) = base→top(기본 cream) 쪽.
    tint: 'tint' 값(0→1)으로 base 자체를 tint 색으로 전환(돌이 달궈짐 등). rim: 가장자리(프레넬) 밝힘 세기.
    조명·그림자 계산이 없어 렌더가 결정적이고, 빛 받는 면의 픽셀은 base hex 와 일치한다"""
    m, nt, L = _nt(name)
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    rgb = nt.nodes.new('ShaderNodeRGB'); rgb.outputs[0].default_value = lin(base); col = rgb.outputs[0]
    if tint:
        tv = nt.nodes.new('ShaderNodeValue'); tv.name = tv.label = 'tint'; tv.outputs[0].default_value = 0.0
        tc = nt.nodes.new('ShaderNodeRGB'); tc.outputs[0].default_value = lin(tint)
        mt = nt.nodes.new('ShaderNodeMix'); mt.data_type = 'RGBA'
        L.new(tv.outputs[0], mt.inputs['Factor']); L.new(col, mt.inputs[6]); L.new(tc.outputs[0], mt.inputs[7]); col = mt.outputs[2]
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    # 그늘: 법선·광원 내적이 낮을수록 shadow 색으로 (계단 2개)
    dot = nt.nodes.new('ShaderNodeVectorMath'); dot.operation = 'DOT_PRODUCT'; dot.inputs[1].default_value = LIGHT
    L.new(geo.outputs['Normal'], dot.inputs[0])
    sh = nt.nodes.new('ShaderNodeValToRGB'); sh.color_ramp.interpolation = 'CONSTANT'
    e = sh.color_ramp.elements; e[0].position, e[0].color = 0.0, (1, 1, 1, 1)
    e[1].position, e[1].color = cuts[0], (0.5, 0.5, 0.5, 1)
    e2 = e.new(cuts[1]); e2.color = (0, 0, 0, 1)
    L.new(dot.outputs['Value'], sh.inputs[0])
    shc = nt.nodes.new('ShaderNodeRGB'); shc.outputs[0].default_value = lin(shadow or "navy")
    ms = nt.nodes.new('ShaderNodeMix'); ms.data_type = 'RGBA'
    fm = nt.nodes.new('ShaderNodeMath'); fm.operation = 'MULTIPLY'; fm.inputs[1].default_value = shadow_mix
    L.new(sh.outputs['Color'], fm.inputs[0]); L.new(fm.outputs[0], ms.inputs['Factor'])
    L.new(col, ms.inputs[6]); L.new(shc.outputs[0], ms.inputs[7]); col = ms.outputs[2]
    # 윗면 밝힘: 월드 법선 z 가 0.7 이상인 면
    sep = nt.nodes.new('ShaderNodeSeparateXYZ'); L.new(geo.outputs['Normal'], sep.inputs[0])
    tz = nt.nodes.new('ShaderNodeMath'); tz.operation = 'GREATER_THAN'; tz.inputs[1].default_value = 0.7
    L.new(sep.outputs['Z'], tz.inputs[0])
    tm = nt.nodes.new('ShaderNodeMath'); tm.operation = 'MULTIPLY'; tm.inputs[1].default_value = top_mix
    L.new(tz.outputs[0], tm.inputs[0])
    tc2 = nt.nodes.new('ShaderNodeRGB'); tc2.outputs[0].default_value = lin(top or "cream")
    mtop = nt.nodes.new('ShaderNodeMix'); mtop.data_type = 'RGBA'
    L.new(tm.outputs[0], mtop.inputs['Factor']); L.new(col, mtop.inputs[6]); L.new(tc2.outputs[0], mtop.inputs[7]); col = mtop.outputs[2]
    if rim:
        lw = nt.nodes.new('ShaderNodeLayerWeight'); lw.inputs['Blend'].default_value = 0.35
        rm = nt.nodes.new('ShaderNodeMath'); rm.operation = 'MULTIPLY'; rm.inputs[1].default_value = rim
        L.new(lw.outputs['Fresnel'], rm.inputs[0])
        mr = nt.nodes.new('ShaderNodeMix'); mr.data_type = 'RGBA'; mr.inputs[7].default_value = lin("cream")
        L.new(rm.outputs[0], mr.inputs['Factor']); L.new(col, mr.inputs[6]); col = mr.outputs[2]
    em = nt.nodes.new('ShaderNodeEmission'); L.new(col, em.inputs[0])
    if alpha is not None:
        av = nt.nodes.new('ShaderNodeValue'); av.name = av.label = 'alpha'; av.outputs[0].default_value = alpha
        tr = nt.nodes.new('ShaderNodeBsdfTransparent'); mx = nt.nodes.new('ShaderNodeMixShader')
        L.new(av.outputs[0], mx.inputs[0]); L.new(tr.outputs[0], mx.inputs[1]); L.new(em.outputs[0], mx.inputs[2])
        L.new(mx.outputs[0], out.inputs[0]); m.surface_render_method = 'BLENDED'
    else:
        L.new(em.outputs[0], out.inputs[0])
    return m


def glow(name, color, loc, r, parent=None, power=2.2, strength=1.0, core=None):
    """발광 구: 정면(카메라 쪽)은 진하고 가장자리로 갈수록 투명 — 블룸 없이 빛 번짐을 만든다.
    'alpha' 값 노드(0→1)로 켜고 끈다. core: 중심 색(없으면 color). 그림자·외곽선 없음"""
    m, nt, L = _nt(name + "_m")
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    lw = nt.nodes.new('ShaderNodeLayerWeight'); lw.inputs['Blend'].default_value = 0.5
    inv = nt.nodes.new('ShaderNodeMath'); inv.operation = 'SUBTRACT'; inv.inputs[0].default_value = 1.0
    L.new(lw.outputs['Facing'], inv.inputs[1])
    pw = nt.nodes.new('ShaderNodeMath'); pw.operation = 'POWER'; pw.inputs[1].default_value = power
    L.new(inv.outputs[0], pw.inputs[0])
    av = nt.nodes.new('ShaderNodeValue'); av.name = av.label = 'alpha'; av.outputs[0].default_value = strength
    am = nt.nodes.new('ShaderNodeMath'); am.operation = 'MULTIPLY'; L.new(pw.outputs[0], am.inputs[0]); L.new(av.outputs[0], am.inputs[1])
    cr = nt.nodes.new('ShaderNodeValToRGB'); cr.color_ramp.elements[0].color = lin(color); cr.color_ramp.elements[1].color = lin(core or color)
    L.new(pw.outputs[0], cr.inputs[0])
    em = nt.nodes.new('ShaderNodeEmission'); L.new(cr.outputs['Color'], em.inputs[0])
    tr = nt.nodes.new('ShaderNodeBsdfTransparent'); mx = nt.nodes.new('ShaderNodeMixShader')
    L.new(am.outputs[0], mx.inputs[0]); L.new(tr.outputs[0], mx.inputs[1]); L.new(em.outputs[0], mx.inputs[2])
    L.new(mx.outputs[0], out.inputs[0])
    m.surface_render_method = 'BLENDED'; m.use_backface_culling = True
    ob = sphere(name, r, loc, m, parent=parent, subdiv=3)
    ob.visible_shadow = False
    return ob, m


def contact_shadow(name, size, loc, parent=None, strength=0.45, color="navy"):
    """물체 아래 부드러운 타원 그림자(접지감). size=(x, y) 반지름. 'alpha' 로 세기 조절"""
    m, nt, L = _nt(name + "_m")
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    tcn = nt.nodes.new('ShaderNodeTexCoord'); gr = nt.nodes.new('ShaderNodeTexGradient'); gr.gradient_type = 'SPHERICAL'
    L.new(tcn.outputs['Object'], gr.inputs['Vector'])
    pw = nt.nodes.new('ShaderNodeMath'); pw.operation = 'POWER'; pw.inputs[1].default_value = 1.6
    L.new(gr.outputs['Fac'], pw.inputs[0])
    av = nt.nodes.new('ShaderNodeValue'); av.name = av.label = 'alpha'; av.outputs[0].default_value = strength
    am = nt.nodes.new('ShaderNodeMath'); am.operation = 'MULTIPLY'; L.new(pw.outputs[0], am.inputs[0]); L.new(av.outputs[0], am.inputs[1])
    em = nt.nodes.new('ShaderNodeEmission'); em.inputs[0].default_value = lin(color)
    tr = nt.nodes.new('ShaderNodeBsdfTransparent'); mx = nt.nodes.new('ShaderNodeMixShader')
    L.new(am.outputs[0], mx.inputs[0]); L.new(tr.outputs[0], mx.inputs[1]); L.new(em.outputs[0], mx.inputs[2])
    L.new(mx.outputs[0], out.inputs[0]); m.surface_render_method = 'BLENDED'
    bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=1.0)
    bmesh.ops.scale(bm, vec=Vector((size[0], size[1], 1)), verts=bm.verts)
    ob = _obj(name, bm, m, loc, parent)
    ob.visible_shadow = False
    return ob, m


# ── v8 룩(2026-09-23): 실제 조명 → 팔레트 툰 · 블룸 · 배경 카드 · 피사계 심도 ─────────
# 조명·시네마틱 시험 구현. 요소별 재질 선택은 docs/16-blender.md §1·§5-1을 따른다.
# 근거: 조회수 100만+ 3D 설명 숏폼 분석(docs/16-blender.md §8) + 5.2.2 실측(조명·AO·블룸·DOF·모션 블러)
# EEVEE 에는 shadow catcher 가 없다(실측) → 배경까지 3D 안에서 불투명으로 렌더한다
def look_v8(sc, bloom=(1.0, 0.55, 0.6), ambient=("navy", 0.35), mblur=0.3, samples=32):
    sc.render.film_transparent = False
    sc.eevee.taa_render_samples = int(os.environ.get('ABM3D_SAMPLES') or samples)
    sc.eevee.use_raytracing = True
    sc.eevee.use_fast_gi = True
    sc.render.use_motion_blur = mblur > 0
    if mblur: sc.render.motion_blur_shutter = mblur
    w = bpy.data.worlds.new("world"); sc.world = w
    if w.node_tree is None: w.use_nodes = True
    bgn = next((n for n in w.node_tree.nodes if n.type == 'BACKGROUND'), None) or w.node_tree.nodes.new('ShaderNodeBackground')
    bgn.inputs[0].default_value = lin(ambient[0]); bgn.inputs[1].default_value = ambient[1]
    if bloom:
        th, size, strength = bloom
        nt = bpy.data.node_groups.new("abm_comp", 'CompositorNodeTree')
        nt.interface.new_socket(name='Image', in_out='OUTPUT', socket_type='NodeSocketColor')
        rl = nt.nodes.new('CompositorNodeRLayers'); g = nt.nodes.new('CompositorNodeGlare'); o = nt.nodes.new('NodeGroupOutput')
        g.inputs['Type'].default_value = 'Bloom'
        g.inputs['Threshold'].default_value = th; g.inputs['Size'].default_value = size; g.inputs['Strength'].default_value = strength
        nt.links.new(rl.outputs['Image'], g.inputs['Image']); nt.links.new(g.outputs['Image'], o.inputs[0])
        sc.compositing_node_group = nt
        sc.render.use_compositing = True
    return sc


def light(name, kind, loc, energy, color="cream", size=1.0, rot=None, target=None, shadow=True):
    """kind: SUN(energy=세기, size=각도 도) · AREA · POINT · SPOT. target 을 주면 그쪽을 본다"""
    ld = bpy.data.lights.new(name, kind)
    ld.energy = energy; ld.color = lin(color)[:3]; ld.use_shadow = shadow
    if kind == 'SUN': ld.angle = math.radians(size)
    elif kind == 'AREA': ld.size = size
    else: ld.shadow_soft_size = size
    ob = bpy.data.objects.new(name, ld); bpy.context.scene.collection.objects.link(ob); ob.location = loc
    if rot: ob.rotation_euler = rot
    if target is not None:
        c = ob.constraints.new('TRACK_TO'); c.target = target; c.track_axis = 'TRACK_NEGATIVE_Z'; c.up_axis = 'UP_Y'
    return ob


def toon(name, base, shadow="navy", hi="cream", sh_mix=0.5, hi_mix=0.32, bands=(0.14, 0.8), tint=None,
         ao=0.45, rim=0.0, noise=0.0, noise_scale=6.0, glow=None, glow_color=None, xray=None, smooth=False, hue=0.55):
    """v8 기본 재질: 흰 Diffuse → Shader to RGB(조명·그림자) → 팔레트 램프(그림자색 · base · 하이라이트색).
    빛을 받는 평면(bands 사이)은 base hex 그대로(실측 1 LSB). 그림자는 base→shadow, 강한 빛은 base→hi 로 색이 바뀐다.
    tint: 'tint'(0→1)로 base 팔레트를 tint 팔레트로 전환. ao: AO 곱 세기. noise: 미세한 결. rim: 가장자리 밝힘.
    glow: 'glow' 값(발광 세기, 1 넘으면 블룸)으로 glow_color(기본 tint/base) 를 더한다.
    xray: 반투명 최저 알파(예 .18) — 'reveal'(0 불투명→1 엑스레이) 값으로 전환, 가장자리는 덜 투명"""
    m, nt, L = _nt(name)
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    df = nt.nodes.new('ShaderNodeBsdfDiffuse'); df.inputs['Color'].default_value = (1, 1, 1, 1)
    s2r = nt.nodes.new('ShaderNodeShaderToRGB'); L.new(df.outputs[0], s2r.inputs[0])
    def ramp_for(c):
        r = nt.nodes.new('ShaderNodeValToRGB'); r.color_ramp.interpolation = 'EASE' if smooth else 'CONSTANT'
        e = r.color_ramp.elements
        e[0].position, e[0].color = 0.0, mixc(c, shadow, sh_mix)
        e[1].position, e[1].color = bands[0], lin(c)
        e2 = e.new(bands[1]); e2.color = mixc(c, hi, hi_mix)
        if smooth:  # 부드러운 모드에서도 base 평면이 넓게 남도록
            e3 = e.new(min(bands[1] - 0.02, bands[0] + 0.3)); e3.color = lin(c)
        L.new(s2r.outputs['Color'], r.inputs[0]); return r.outputs['Color']
    col = ramp_for(base)
    if tint:
        tv = nt.nodes.new('ShaderNodeValue'); tv.name = tv.label = 'tint'; tv.outputs[0].default_value = 0.0
        mt = nt.nodes.new('ShaderNodeMix'); mt.data_type = 'RGBA'
        L.new(tv.outputs[0], mt.inputs['Factor']); L.new(col, mt.inputs[6]); L.new(ramp_for(tint), mt.inputs[7]); col = mt.outputs[2]
    if noise:
        tx = nt.nodes.new('ShaderNodeTexNoise'); tx.inputs['Scale'].default_value = noise_scale
        mr = nt.nodes.new('ShaderNodeMapRange'); mr.inputs['To Min'].default_value = 1 - noise; mr.inputs['To Max'].default_value = 1 + noise
        L.new(tx.outputs['Fac'], mr.inputs['Value'])
        mn = nt.nodes.new('ShaderNodeMix'); mn.data_type = 'RGBA'; mn.blend_type = 'MULTIPLY'; mn.inputs['Factor'].default_value = 1
        cv = nt.nodes.new('ShaderNodeCombineColor'); L.new(mr.outputs['Result'], cv.inputs[0]); L.new(mr.outputs['Result'], cv.inputs[1]); L.new(mr.outputs['Result'], cv.inputs[2])
        L.new(col, mn.inputs[6]); L.new(cv.outputs[0], mn.inputs[7]); col = mn.outputs[2]
    if hue:   # 빛의 색조 — 램프는 밝기(BW)만 읽어 불빛의 주황을 버린다. S2R 색을 밝기로 나눠 색만 뽑아 곱한다
        bw = nt.nodes.new('ShaderNodeRGBToBW'); L.new(s2r.outputs['Color'], bw.inputs[0])
        mx_ = nt.nodes.new('ShaderNodeMath'); mx_.operation = 'MAXIMUM'; mx_.inputs[1].default_value = 0.02; L.new(bw.outputs[0], mx_.inputs[0])
        dv = nt.nodes.new('ShaderNodeVectorMath'); dv.operation = 'DIVIDE'
        L.new(s2r.outputs['Color'], dv.inputs[0]); L.new(mx_.outputs[0], dv.inputs[1])
        mh = nt.nodes.new('ShaderNodeVectorMath'); mh.operation = 'MINIMUM'; mh.inputs[1].default_value = (1.8, 1.8, 1.8)
        L.new(dv.outputs[0], mh.inputs[0])
        mw = nt.nodes.new('ShaderNodeMix'); mw.data_type = 'RGBA'; mw.inputs['Factor'].default_value = hue
        mw.inputs[6].default_value = (1, 1, 1, 1); L.new(mh.outputs[0], mw.inputs[7])
        mm = nt.nodes.new('ShaderNodeMix'); mm.data_type = 'RGBA'; mm.blend_type = 'MULTIPLY'; mm.inputs['Factor'].default_value = 1
        L.new(col, mm.inputs[6]); L.new(mw.outputs[2], mm.inputs[7]); col = mm.outputs[2]
    if ao:
        aon = nt.nodes.new('ShaderNodeAmbientOcclusion'); aon.inputs['Distance'].default_value = 0.5
        am = nt.nodes.new('ShaderNodeMapRange'); am.inputs['To Min'].default_value = 1 - ao; am.inputs['To Max'].default_value = 1.0
        L.new(aon.outputs['AO'], am.inputs['Value'])
        cv2 = nt.nodes.new('ShaderNodeCombineColor')
        for i in range(3): L.new(am.outputs['Result'], cv2.inputs[i])
        ma = nt.nodes.new('ShaderNodeMix'); ma.data_type = 'RGBA'; ma.blend_type = 'MULTIPLY'; ma.inputs['Factor'].default_value = 1
        L.new(col, ma.inputs[6]); L.new(cv2.outputs[0], ma.inputs[7]); col = ma.outputs[2]
    if rim:
        lw = nt.nodes.new('ShaderNodeLayerWeight'); lw.inputs['Blend'].default_value = 0.3
        rm = nt.nodes.new('ShaderNodeMath'); rm.operation = 'MULTIPLY'; rm.inputs[1].default_value = rim
        L.new(lw.outputs['Fresnel'], rm.inputs[0])
        mr2 = nt.nodes.new('ShaderNodeMix'); mr2.data_type = 'RGBA'; mr2.inputs[7].default_value = lin(hi)
        L.new(rm.outputs[0], mr2.inputs['Factor']); L.new(col, mr2.inputs[6]); col = mr2.outputs[2]
    em = nt.nodes.new('ShaderNodeEmission'); L.new(col, em.inputs[0])
    sh = em.outputs[0]
    if glow is not None:
        gv = nt.nodes.new('ShaderNodeValue'); gv.name = gv.label = 'glow'; gv.outputs[0].default_value = glow
        ge = nt.nodes.new('ShaderNodeEmission'); ge.inputs[0].default_value = lin(glow_color or tint or base)
        L.new(gv.outputs[0], ge.inputs['Strength'])
        ad = nt.nodes.new('ShaderNodeAddShader'); L.new(sh, ad.inputs[0]); L.new(ge.outputs[0], ad.inputs[1]); sh = ad.outputs[0]
    if xray is not None:
        rv = nt.nodes.new('ShaderNodeValue'); rv.name = rv.label = 'reveal'; rv.outputs[0].default_value = 0.0
        lw2 = nt.nodes.new('ShaderNodeLayerWeight'); lw2.inputs['Blend'].default_value = 0.4
        ea = nt.nodes.new('ShaderNodeMapRange'); ea.inputs['To Min'].default_value = xray; ea.inputs['To Max'].default_value = min(1.0, xray + 0.55)
        L.new(lw2.outputs['Fresnel'], ea.inputs['Value'])
        fa = nt.nodes.new('ShaderNodeMix'); fa.data_type = 'FLOAT'; fa.inputs[2].default_value = 1.0   # reveal 0 → 1(불투명)
        L.new(rv.outputs[0], fa.inputs['Factor']); L.new(ea.outputs['Result'], fa.inputs[3])
        tr = nt.nodes.new('ShaderNodeBsdfTransparent'); mx = nt.nodes.new('ShaderNodeMixShader')
        L.new(fa.outputs[0], mx.inputs[0]); L.new(tr.outputs[0], mx.inputs[1]); L.new(sh, mx.inputs[2]); sh = mx.outputs[0]
        m.surface_render_method = 'BLENDED'
    L.new(sh, out.inputs[0])
    return m


def emit(name, color, power=3.0, core=None, alpha=None):
    """발광 재질(불·온수 코어) — power 가 1 을 넘으면 블룸. core: 정면 중심 색(프레넬로 가장자리 color).
    'power' 값 노드로 세기 키프레임, alpha 를 주면 'alpha' 로 페이드"""
    m, nt, L = _nt(name)
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    pv = nt.nodes.new('ShaderNodeValue'); pv.name = pv.label = 'power'; pv.outputs[0].default_value = power
    em = nt.nodes.new('ShaderNodeEmission'); L.new(pv.outputs[0], em.inputs['Strength'])
    if core:
        lw = nt.nodes.new('ShaderNodeLayerWeight'); lw.inputs['Blend'].default_value = 0.45
        cr = nt.nodes.new('ShaderNodeValToRGB'); cr.color_ramp.elements[0].color = lin(core); cr.color_ramp.elements[1].color = lin(color)
        L.new(lw.outputs['Facing'], cr.inputs[0]); L.new(cr.outputs['Color'], em.inputs['Color'])
    else:
        em.inputs['Color'].default_value = lin(color)
    sh = em.outputs[0]
    if alpha is not None:
        av = nt.nodes.new('ShaderNodeValue'); av.name = av.label = 'alpha'; av.outputs[0].default_value = alpha
        tr = nt.nodes.new('ShaderNodeBsdfTransparent'); mx = nt.nodes.new('ShaderNodeMixShader')
        L.new(av.outputs[0], mx.inputs[0]); L.new(tr.outputs[0], mx.inputs[1]); L.new(sh, mx.inputs[2]); sh = mx.outputs[0]
        m.surface_render_method = 'BLENDED'
    L.new(sh, out.inputs[0])
    return m


def backdrop(cam, top="navy", bottom="line", split=0.45, vignette=0.28, dist=90.0, min_lens=18.0, glow_pos=None, glow_color=None, glow_amt=0.0):
    """카메라에 붙은 배경 카드(항상 화면을 채움). 위쪽(제목 구역)은 top hex 그대로, 아래로 bottom 까지 그라데이션,
    가장자리 비네트. glow_pos=(u,v) 화면 좌표(0~1)에 glow_color 빛무리를 glow_amt 만큼(키프레임 'bgglow')"""
    cam.data.clip_end = max(cam.data.clip_end, dist * 1.6)
    hh = dist * 18.0 / min_lens * 1.12; hw = hh * (W / H) * 1.12
    m, nt, L = _nt("backdrop_m")
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    tc = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ'); L.new(tc.outputs['UV'], sep.inputs[0])
    r = nt.nodes.new('ShaderNodeValToRGB'); e = r.color_ramp.elements
    e[0].position, e[0].color = 0.0, lin(bottom); e[1].position, e[1].color = split, lin(top)
    L.new(sep.outputs['Y'], r.inputs[0])
    col = r.outputs['Color']
    if vignette:
        sub = nt.nodes.new('ShaderNodeVectorMath'); sub.operation = 'SUBTRACT'; sub.inputs[1].default_value = (0.5, 0.42, 0)
        L.new(tc.outputs['UV'], sub.inputs[0])
        ln = nt.nodes.new('ShaderNodeVectorMath'); ln.operation = 'LENGTH'; L.new(sub.outputs[0], ln.inputs[0])
        vm = nt.nodes.new('ShaderNodeMapRange'); vm.inputs['From Min'].default_value = 0.45; vm.inputs['From Max'].default_value = 0.85
        vm.inputs['To Min'].default_value = 1.0; vm.inputs['To Max'].default_value = 1.0 - vignette
        L.new(ln.outputs['Value'], vm.inputs['Value'])
        cv = nt.nodes.new('ShaderNodeCombineColor')
        for i in range(3): L.new(vm.outputs['Result'], cv.inputs[i])
        mv = nt.nodes.new('ShaderNodeMix'); mv.data_type = 'RGBA'; mv.blend_type = 'MULTIPLY'; mv.inputs['Factor'].default_value = 1
        L.new(col, mv.inputs[6]); L.new(cv.outputs[0], mv.inputs[7]); col = mv.outputs[2]
    if glow_pos:
        sub2 = nt.nodes.new('ShaderNodeVectorMath'); sub2.operation = 'SUBTRACT'; sub2.inputs[1].default_value = (glow_pos[0], glow_pos[1], 0)
        L.new(tc.outputs['UV'], sub2.inputs[0])
        ln2 = nt.nodes.new('ShaderNodeVectorMath'); ln2.operation = 'LENGTH'; L.new(sub2.outputs[0], ln2.inputs[0])
        gm = nt.nodes.new('ShaderNodeMapRange'); gm.inputs['From Min'].default_value = 0.0; gm.inputs['From Max'].default_value = 0.45
        gm.inputs['To Min'].default_value = 1.0; gm.inputs['To Max'].default_value = 0.0
        L.new(ln2.outputs['Value'], gm.inputs['Value'])
        gv = nt.nodes.new('ShaderNodeValue'); gv.name = gv.label = 'bgglow'; gv.outputs[0].default_value = glow_amt
        gmul = nt.nodes.new('ShaderNodeMath'); gmul.operation = 'MULTIPLY'; L.new(gm.outputs['Result'], gmul.inputs[0]); L.new(gv.outputs[0], gmul.inputs[1])
        mg = nt.nodes.new('ShaderNodeMix'); mg.data_type = 'RGBA'; mg.inputs[7].default_value = lin(glow_color or "coral")
        L.new(gmul.outputs[0], mg.inputs['Factor']); L.new(col, mg.inputs[6]); col = mg.outputs[2]
    em = nt.nodes.new('ShaderNodeEmission'); L.new(col, em.inputs[0]); L.new(em.outputs[0], out.inputs[0])
    bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=1.0, calc_uvs=True)
    bmesh.ops.scale(bm, vec=Vector((hw, hh, 1)), verts=bm.verts)
    ob = _obj("backdrop", bm, m, (0, 0, -dist), cam)
    ob.visible_shadow = False
    ob.visible_diffuse = False; ob.visible_glossy = False   # 배경이 물체를 비추지 않게
    return ob, m


def dof(cam, focus, fstop=4.0):
    cam.data.dof.use_dof = True; cam.data.dof.focus_object = focus; cam.data.dof.aperture_fstop = fstop


def snow(name, center, size, t0, t1, speed=1.2, density=38.0, dot=0.06, color="cream", alpha=0.85, facing=(math.radians(90), 0, 0)):
    """내리는 눈 한 겹: 보로노이 점 무늬 평면을 아래로 흘린다(텍스처 오프셋 키프레임, 결정적). 겹을 깊이별로 여러 장"""
    m, nt, L = _nt(name + "_m")
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    tc = nt.nodes.new('ShaderNodeTexCoord'); mp = nt.nodes.new('ShaderNodeMapping'); mp.name = 'map'
    L.new(tc.outputs['UV'], mp.inputs['Vector'])
    vo = nt.nodes.new('ShaderNodeTexVoronoi'); vo.inputs['Scale'].default_value = density
    L.new(mp.outputs['Vector'], vo.inputs['Vector'])
    th = nt.nodes.new('ShaderNodeMath'); th.operation = 'LESS_THAN'; th.inputs[1].default_value = dot
    L.new(vo.outputs['Distance'], th.inputs[0])
    am = nt.nodes.new('ShaderNodeMath'); am.operation = 'MULTIPLY'; am.inputs[1].default_value = alpha; L.new(th.outputs[0], am.inputs[0])
    em = nt.nodes.new('ShaderNodeEmission'); em.inputs[0].default_value = lin(color)
    tr = nt.nodes.new('ShaderNodeBsdfTransparent'); mx = nt.nodes.new('ShaderNodeMixShader')
    L.new(am.outputs[0], mx.inputs[0]); L.new(tr.outputs[0], mx.inputs[1]); L.new(em.outputs[0], mx.inputs[2]); L.new(mx.outputs[0], out.inputs[0])
    m.surface_render_method = 'BLENDED'
    bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=1.0, calc_uvs=True)
    bmesh.ops.scale(bm, vec=Vector((size[0], size[1], 1)), verts=bm.verts)
    ob = _obj(name, bm, m, center); ob.rotation_euler = facing; ob.visible_shadow = False
    loc = mp.inputs['Location']
    tween(loc, 'default_value', t0, t1, (0.0, 0.0, 0.0), (0.03 * (t1 - t0), speed * (t1 - t0) / max(size[1], 1e-3), 0.0), 'none')
    return ob


def pipe_material(name, c0="coral", c1="cool", stripes=14.0, ramp_start=0.35, power=1.0, shade=True):
    """UV.x = 관 길이 비율. 'progress'(0~1)까지만 보이고(하드 컷), c0→c1 그라데이션, 'offset' 증가 = 줄무늬가 관을 따라 전진"""
    m, nt, L = _nt(name)
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    uv = nt.nodes.new('ShaderNodeUVMap'); uv.uv_map = 'UVMap'
    sep = nt.nodes.new('ShaderNodeSeparateXYZ'); L.new(uv.outputs[0], sep.inputs[0]); u = sep.outputs['X']
    prog = nt.nodes.new('ShaderNodeValue'); prog.name = prog.label = 'progress'; prog.outputs[0].default_value = 1.0
    off = nt.nodes.new('ShaderNodeValue'); off.name = off.label = 'offset'; off.outputs[0].default_value = 0.0
    lt = nt.nodes.new('ShaderNodeMath'); lt.operation = 'LESS_THAN'; L.new(u, lt.inputs[0]); L.new(prog.outputs[0], lt.inputs[1])
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color = lin(c0); ramp.color_ramp.elements[1].color = lin(c1)
    ramp.color_ramp.elements[0].position = ramp_start
    L.new(u, ramp.inputs[0])
    mu = nt.nodes.new('ShaderNodeMath'); mu.operation = 'MULTIPLY'; mu.inputs[1].default_value = stripes; L.new(u, mu.inputs[0])
    sb = nt.nodes.new('ShaderNodeMath'); sb.operation = 'SUBTRACT'; L.new(mu.outputs[0], sb.inputs[0]); L.new(off.outputs[0], sb.inputs[1])
    fc = nt.nodes.new('ShaderNodeMath'); fc.operation = 'FRACT'; L.new(sb.outputs[0], fc.inputs[0])
    gt = nt.nodes.new('ShaderNodeMath'); gt.operation = 'GREATER_THAN'; gt.inputs[1].default_value = 0.78; L.new(fc.outputs[0], gt.inputs[0])
    sv = nt.nodes.new('ShaderNodeMath'); sv.operation = 'MULTIPLY'; sv.inputs[1].default_value = 0.22; L.new(gt.outputs[0], sv.inputs[0])
    mx = nt.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'
    L.new(sv.outputs[0], mx.inputs['Factor']); L.new(ramp.outputs['Color'], mx.inputs[6]); mx.inputs[7].default_value = (1, 1, 1, 1)
    shade = _shade(nt, L, ((0.0, 0.8), (0.3, 1.0)))
    mul = nt.nodes.new('ShaderNodeMix'); mul.data_type = 'RGBA'; mul.blend_type = 'MULTIPLY'; mul.inputs['Factor'].default_value = 1
    L.new(mx.outputs[2], mul.inputs[6]); L.new(shade, mul.inputs[7])
    em = nt.nodes.new('ShaderNodeEmission'); L.new(mul.outputs[2] if shade else mx.outputs[2], em.inputs[0])
    pv = nt.nodes.new('ShaderNodeValue'); pv.name = pv.label = 'power'; pv.outputs[0].default_value = power   # 1 넘으면 블룸
    L.new(pv.outputs[0], em.inputs['Strength'])
    tr = nt.nodes.new('ShaderNodeBsdfTransparent'); ms = nt.nodes.new('ShaderNodeMixShader')
    L.new(lt.outputs[0], ms.inputs[0]); L.new(tr.outputs[0], ms.inputs[1]); L.new(em.outputs[0], ms.inputs[2])
    L.new(ms.outputs[0], out.inputs[0])
    return m


_OUTL = {}
def outline(ob, t=0.03, color=None):
    """인버티드 헐 외곽선: 뒤집은 법선 솔리디파이 + 뒷면 컬링 재질"""
    color = color or OUTLINE
    if color not in _OUTL:
        m, nt, L = _nt("outline_" + color)
        o = nt.nodes.new('ShaderNodeOutputMaterial'); e = nt.nodes.new('ShaderNodeEmission')
        e.inputs[0].default_value = lin(color); L.new(e.outputs[0], o.inputs[0])
        m.use_backface_culling = True
        _OUTL[color] = m
    ob.data.materials.append(_OUTL[color])
    so = ob.modifiers.new("hull", 'SOLIDIFY'); so.thickness = -t; so.use_flip_normals = True
    so.material_offset = len(ob.data.materials) - 1; so.use_rim = False
    return ob


# ── 형태 (전부 데이터 API) ────────────────────────────────────────────
def _obj(name, bm, mat, loc=(0, 0, 0), parent=None, line=0.0, smooth=False, bevel=0.0, bevel_seg=3):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    if smooth:
        for p in me.polygons: p.use_smooth = True
    ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob)
    if mat: me.materials.append(mat)            # 슬롯 0 = 본 재질 (material_index 0)
    if bevel:
        b = ob.modifiers.new("bevel", 'BEVEL'); b.width = bevel; b.segments = bevel_seg
    if line: outline(ob, line)
    if parent: ob.parent = parent                # 부모 역행렬 = 단위 → loc 는 부모 기준
    ob.location = loc
    return ob


def box(name, size, loc, mat, bevel=0.04, parent=None, line=0.02):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    return _obj(name, bm, mat, loc, parent, line, bevel=bevel)


def cyl(name, r, depth, loc, mat, rot=(0, 0, 0), verts=32, parent=None, line=0.02, r2=None, smooth=True):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=verts, radius1=r, radius2=r if r2 is None else r2, depth=depth)
    ob = _obj(name, bm, mat, loc, parent, line, smooth=smooth)
    ob.rotation_euler = rot
    return ob


def cone(name, r1, r2, depth, loc, mat, verts=24, parent=None, line=0.0):
    return cyl(name, r1, depth, loc, mat, verts=verts, parent=parent, line=line, r2=r2, smooth=False)


def sphere(name, r, loc, mat, parent=None, line=0.0, subdiv=2):
    bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=r)
    return _obj(name, bm, mat, loc, parent, line, smooth=True)


def empty(name, loc, parent=None):
    ob = bpy.data.objects.new(name, None); bpy.context.scene.collection.objects.link(ob)
    if parent: ob.parent = parent
    ob.location = loc
    return ob


def rounded_path(pts, r=0.3, seg=8):
    """꺾은선(3D 점) → 모서리를 반경 r 원호(이차 베지어 근사)로 둥글린 조밀 점열"""
    P = [Vector(p) for p in pts]; out = [P[0]]
    for i in range(1, len(P) - 1):
        a, b, c = P[i - 1], P[i], P[i + 1]
        d1 = (b - a).normalized(); d2 = (c - b).normalized()
        rr = min(r, (b - a).length / 2, (c - b).length / 2)
        p0 = b - d1 * rr; p2 = b + d2 * rr
        for k in range(seg + 1):
            s = k / seg
            out.append((1 - s) ** 2 * p0 + 2 * (1 - s) * s * b + s ** 2 * p2)
    out.append(P[-1])
    return out


def circle_path(center, radius, n=48):
    c = Vector(center)
    return [c + Vector((radius * math.cos(2 * math.pi * k / n), radius * math.sin(2 * math.pi * k / n), 0)) for k in range(n)]


def tube(name, path, radius, mat, ring=16, parent=None, line=0.0, closed=False):
    """점열을 따라 원형 단면을 쓸어 만든 관. UV.x = 누적 길이 비율(0→1). closed=True 면 고리"""
    P = [Vector(p) for p in path]
    seq = P + [P[0]] if closed else P
    Lc = [0.0]
    for i in range(1, len(seq)): Lc.append(Lc[-1] + (seq[i] - seq[i - 1]).length)
    tot = Lc[-1] or 1.0
    bm = bmesh.new(); uvl = bm.loops.layers.uv.new("UVMap"); rings = []
    n = len(P)
    for i, p in enumerate(P):
        if closed:
            t = (P[(i + 1) % n] - P[(i - 1) % n]).normalized()
        else:
            t = (P[min(i + 1, n - 1)] - P[max(i - 1, 0)]).normalized()
        nn = t.cross(Vector((0, 0, 1)))
        if nn.length < 1e-4: nn = t.cross(Vector((0, 1, 0)))
        nn.normalize(); b = t.cross(nn).normalized()
        rings.append([bm.verts.new(p + radius * (math.cos(2 * math.pi * k / ring) * nn + math.sin(2 * math.pi * k / ring) * b)) for k in range(ring)])
    segs = n if closed else n - 1
    for i in range(segs):
        j = (i + 1) % n
        for k in range(ring):
            k2 = (k + 1) % ring
            f = bm.faces.new((rings[i][k], rings[i][k2], rings[j][k2], rings[j][k]))
            for lp, (ii, kk) in zip(f.loops, ((i, k), (i, k2), (i + 1, k2), (i + 1, k))):
                lp[uvl].uv = (Lc[ii] / tot, kk / ring)
    if not closed:
        for end in (0, n - 1):
            f = bm.faces.new(rings[end] if end else list(reversed(rings[end])))
            for lp in f.loops: lp[uvl].uv = (Lc[end] / tot, 0.5)
    ob = _obj(name, bm, mat, (0, 0, 0), parent, line, smooth=True)
    return ob, tot


def arrow(name, length, mat, loc, direction=(0, 0, 1), shaft=0.07, head=0.18, parent=None, line=0.018):
    root = empty(name, loc, parent)
    cyl(name + "_s", shaft, length * 0.62, (0, 0, length * 0.31), mat, parent=root, line=line, verts=20)
    cone(name + "_h", head, 0.0, length * 0.38, (0, 0, length * 0.81), mat, parent=root, line=line)
    root.rotation_mode = 'QUATERNION'
    root.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(Vector(direction).normalized())
    return root


# ── 애니메이션 (5.x 슬롯 액션) ────────────────────────────────────────
EASE = {  # GSAP 이름 → (interpolation, easing)
    'none': ('LINEAR', 'AUTO'), 'linear': ('LINEAR', 'AUTO'), 'step': ('CONSTANT', 'AUTO'),
    'power1.in': ('SINE', 'EASE_IN'), 'power1.out': ('SINE', 'EASE_OUT'), 'power1.inOut': ('SINE', 'EASE_IN_OUT'),
    'sine.in': ('SINE', 'EASE_IN'), 'sine.out': ('SINE', 'EASE_OUT'), 'sine.inOut': ('SINE', 'EASE_IN_OUT'),
    'power2.in': ('QUAD', 'EASE_IN'), 'power2.out': ('QUAD', 'EASE_OUT'), 'power2.inOut': ('QUAD', 'EASE_IN_OUT'),
    'power3.in': ('CUBIC', 'EASE_IN'), 'power3.out': ('CUBIC', 'EASE_OUT'), 'power3.inOut': ('CUBIC', 'EASE_IN_OUT'),
    'power4.out': ('QUART', 'EASE_OUT'), 'expo.out': ('EXPO', 'EASE_OUT'), 'expo.inOut': ('EXPO', 'EASE_IN_OUT'),
    'circ.out': ('CIRC', 'EASE_OUT'),
    'back.out': ('BACK', 'EASE_OUT'), 'back.in': ('BACK', 'EASE_IN'), 'back.inOut': ('BACK', 'EASE_IN_OUT'),
    'elastic.out': ('ELASTIC', 'EASE_OUT'), 'bounce.out': ('BOUNCE', 'EASE_OUT'),
}


def key(idb, path, t, value, ease='power2.out', index=-1, back=1.9):
    """idb(ID 또는 노드 소켓 등)의 path 를 t초에 value 로 고정. 이 키에서 다음 키까지의 구간 이징 = ease"""
    if ease not in EASE: raise ValueError(f"모르는 이징 {ease}")
    if index >= 0:
        getattr(idb, path)[index] = value
    elif isinstance(value, (tuple, list, Vector)):
        getattr(idb, path)[:] = tuple(value)
    else:
        setattr(idb, path, value)
    f = fr(t)
    idb.keyframe_insert(data_path=path, frame=f, index=index)
    owner = idb.id_data
    dp = path if idb == owner else idb.path_from_id(path)
    cb = anim_utils.animdata_get_channelbag_for_assigned_slot(owner.animation_data)
    ip, ez = EASE[ease]; hit = 0
    for fc in cb.fcurves:
        if fc.data_path != dp or (index >= 0 and fc.array_index != index): continue
        for k in fc.keyframe_points:
            if abs(k.co.x - f) < 0.5:
                k.interpolation = ip
                if ez != 'AUTO': k.easing = ez
                if ip == 'BACK': k.back = back
                hit += 1
    if not hit: raise RuntimeError(f"키 못 찾음: {owner.name} {dp}[{index}] @f{f}")


def tween(idb, path, t0, t1, v0, v1, ease='power2.out', index=-1):
    key(idb, path, t0, v0, ease, index); key(idb, path, t1, v1, 'power2.out', index)


def sock(mat, name):
    return mat.node_tree.nodes[name].outputs[0]


def tween_node(mat, name, t0, t1, v0, v1, ease='power2.out'):
    tween(sock(mat, name), 'default_value', t0, t1, v0, v1, ease)


def set_node(mat, name, t, v, ease='step'):
    key(sock(mat, name), 'default_value', t, v, ease)


def visible(ob, t_show=None, t_hide=None):
    """렌더 가시성 계단: t_show 전 숨김, t_hide 부터 숨김 (자식 포함)"""
    for o in [ob] + list(ob.children_recursive):
        if t_show is not None:
            key(o, 'hide_render', 0.0, True, 'step'); key(o, 'hide_render', t_show, False, 'step')
        if t_hide is not None:
            key(o, 'hide_render', t_hide, True, 'step')


# ── 형태 QA·검수 시트 (2026-10-22 — EL4CTEO/blender-skills asset-qa·review_shots, MIT, 를 이 파이프라인에 맞춰 줄임) ──
#   그 저장소는 게임 에셋(PBR·내보내기)용이라 그대로 쓰지 않는다. 가져온 것: 같은 방향 면 겹침(z-fighting), 떨어진 조각, 법선이 안쪽을 보는 닫힌 조각,
#   퇴화 면·중복 정점, 음수 스케일, 빠진 이미지 파일 + Workbench 무작위 색 다각도 스틸. 뺀 것: 스케일 미적용(우리는 scale 을 애니메이션한다),
#   UV 통계·웨이트·n-gon(내보내기용), 트라이 예산. 외곽선 헐(outline_ 재질·SOLIDIFY 뒤집힌 법선)은 설계라 법선 검사는 기본 메시로, 겹침 검사에서 헐 면은 뺀다.
def _bm_world(ob, evaluated):
    bm = bmesh.new()
    if evaluated: bm.from_object(ob, bpy.context.evaluated_depsgraph_get())
    else: bm.from_mesh(ob.data)
    bm.transform(ob.matrix_world); bm.verts.ensure_lookup_table(); bm.faces.ensure_lookup_table()
    return bm


def _islands(bm):
    parent = list(range(len(bm.verts)))
    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]; i = parent[i]
        return i
    for e in bm.edges:
        a, b = find(e.verts[0].index), find(e.verts[1].index)
        if a != b: parent[a] = b
    roots = [find(i) for i in range(len(bm.verts))]
    remap = {r: n for n, r in enumerate(dict.fromkeys(roots))}
    return [remap[r] for r in roots]


def _in_tri(p, a, b, c, n):
    return all((v - u).cross(p - u).dot(n) >= -1e-9 for u, v in ((a, b), (b, c), (c, a)))


def _qa_objects(ignore=()):
    sc = bpy.context.scene
    return [ob for ob in sc.objects if ob.type == 'MESH' and not ob.hide_render and ob.name not in ignore
            and min(abs(v) for v in ob.matrix_world.to_scale()) >= 0.02]


def qa_check(ignore=(), strict=False, max_tris=300000, ok=()):
    """장면 첫 프레임의 메시를 숫자로 검사해 ABM3D_QA 줄로 출력. errors = 겹침·뒤집힌 법선·어긋난 면 방향·음수 스케일·빠진 이미지,
    warnings = 떠 있는 조각(입자·공중 주연처럼 의도된 것이 많다 — run(ignore=) 에 적는다)·맞댄 면·퇴화 면·중복 정점·빈 재질 슬롯.
    거리 기준은 물체 크기의 중앙값에서 정한다(eps = 0.05% → 1mm~5cm, tol = 0.3% → 5mm~30cm — 00051 타워 107개 물체 0.5초). strict 면 errors 에서 예외(ABM3D_QA_STRICT=1).
    ok = 의도된 겹침 — 오브젝트 이름 또는 (이름, 이름) 쌍(동축 관의 progress 덧칠처럼). 그 겹침은 경고로 내린다"""
    from collections import Counter, defaultdict
    from mathutils.bvhtree import BVHTree
    from mathutils.kdtree import KDTree
    import time; T0 = time.time(); DBG = os.environ.get('ABM3D_QA_DEBUG')
    lap = lambda tag: DBG and print(f"ABM3D_QA_DEBUG {tag} +{time.time() - T0:.1f}s", flush=True)
    sc = bpy.context.scene; sc.frame_set(sc.frame_start)
    obs = _qa_objects(ignore); errors, warns = [], []
    if not obs:
        print("ABM3D_QA errors=0 warnings=0 objects=0"); return {"errors": [], "warnings": []}
    dg = bpy.context.evaluated_depsgraph_get()
    # 거리 기준 = 물체 크기의 중앙값(배경판·하늘처럼 거대한 물체 하나가 기준을 망치지 않게 — 00051: 장면 대각선 기준이 eps 283m 이 되어 25분, 결과도 엉터리).
    #   z-fighting 은 절대 거리 문제라 1mm~5cm 로 묶는다
    def _diag(ob):
        e = ob.evaluated_get(dg); b = [e.matrix_world @ Vector(c) for c in e.bound_box]
        return (Vector([max(p[i] for p in b) for i in range(3)]) - Vector([min(p[i] for p in b) for i in range(3)])).length
    ds = sorted(_diag(ob) for ob in obs); med = max(ds[len(ds) // 2], 1e-3)
    eps = min(max(med * 5e-4, 1e-3), 0.05); tol = min(max(med * 3e-3, 5e-3), 0.3)
    verts, tris, meta, island = [], [], [], {}; gid = 0
    for oi, ob in enumerate(obs):
        bm = _bm_world(ob, False); isl = _islands(bm); n_isl = (max(isl) + 1) if isl else 0
        degenerate = sum(1 for f in bm.faces if f.calc_area() < 1e-10)
        dirs = Counter((l.vert.index, l.link_loop_next.vert.index) for f in bm.faces for l in f.loops)
        inconsistent = sum(1 for c in dirs.values() if c > 1)
        kd = KDTree(len(bm.verts))
        for v in bm.verts: kd.insert(v.co, v.index)
        kd.balance(); dup = sum(1 for v in bm.verts if len(kd.find_range(v.co, 1e-5)) > 1) // 2
        closed, vol = defaultdict(lambda: True), defaultdict(float)
        for e in bm.edges:
            if len(e.link_faces) != 2: closed[isl[e.verts[0].index]] = False
        bt = bm.copy(); bmesh.ops.triangulate(bt, faces=bt.faces[:]); bt.verts.ensure_lookup_table()
        for f in bt.faces:
            a, b, c = (v.co for v in f.verts); vol[isl[f.verts[0].index]] += a.dot(b.cross(c)) / 6.0
        bt.free(); bm.free()
        inside_out = sum(1 for g in range(n_isl) if closed[g] and vol[g] < -1e-9)
        sx = ob.matrix_world.to_scale()
        if sx.x * sx.y * sx.z < 0: errors.append(f"{ob.name}: 음수 스케일 — 법선·외곽선 헐이 뒤집힌다")
        if inside_out: errors.append(f"{ob.name}: 법선이 안쪽을 보는 닫힌 조각 {inside_out}개 — bmesh.ops.recalc_face_normals")
        if inconsistent: errors.append(f"{ob.name}: 이웃 면의 감기 방향이 어긋난 모서리 {inconsistent}개")
        if degenerate: warns.append(f"{ob.name}: 면적 0 면 {degenerate}개")
        if dup: warns.append(f"{ob.name}: 중복 정점 {dup}쌍 — bmesh.ops.remove_doubles")
        if not ob.material_slots or any(sl.material is None for sl in ob.material_slots): warns.append(f"{ob.name}: 재질 슬롯 없음/비어 있음")
        # 겹침·분리 검사는 모디파이어 적용본(화면에 보이는 것)으로, 외곽선 헐 면은 뺀다
        bme = _bm_world(ob, True); isl_e = _islands(bme); base = len(verts); verts.extend(v.co.copy() for v in bme.verts)
        outl = {i for i, sl in enumerate(ob.material_slots) if sl.material and sl.material.name.startswith('outline_')}
        bt = bme.copy(); bmesh.ops.triangulate(bt, faces=bt.faces[:]); bt.verts.ensure_lookup_table()
        blended = {i for i, sl in enumerate(ob.material_slots) if sl.material and sl.material.surface_render_method == 'BLENDED'}
        for f in bt.faces:
            if f.material_index in outl: continue
            g = gid + isl_e[f.verts[0].index]; tris.append(tuple(base + v.index for v in f.verts)); meta.append((oi, g, f.normal.copy(), f.material_index in blended))
            info = island.setdefault(g, {"ob": ob.name, "verts": set(), "tris": []})
            info["verts"].update(base + v.index for v in f.verts); info["tris"].append(len(tris) - 1)
        bt.free(); bme.free(); gid += (max(isl_e) + 1) if isl_e else 0
    lap(f"per-object done objects={len(obs)} tris={len(tris)} islands={len(island)}")
    for im in bpy.data.images:
        if im.source == 'FILE' and not im.packed_file and not os.path.exists(bpy.path.abspath(im.filepath)):
            errors.append(f"이미지 파일 없음: {im.name} ← {im.filepath}")
    if len(tris) > max_tris: warns.append(f"삼각형 {len(tris)} > {max_tris} — 겹침·분리 검사 생략")
    elif tris:
        bvh = BVHTree.FromPolygons(verts, tris, epsilon=0.0); tri_sets = [set(t) for t in tris]
        zf, zf_blend, b2b = set(), set(), set()
        # 큰 메시(지형·로프트)는 표본 검사 — 삼각형 step 개마다 하나, 점도 무게중심 하나 (00051 타워: 전수 검사가 10분 넘게 걸렸다)
        step = max(1, len(tris) // 60000); full = len(tris) <= 15000
        for ti in range(0, len(tris), step):
            t = tris[ti]; a, b, c = (verts[i] for i in t); n = meta[ti][2]
            if n.length < 0.5: continue
            cen = (a + b + c) / 3
            for p in ((cen, cen.lerp(a, .6), cen.lerp(b, .6), cen.lerp(c, .6)) if full else (cen,)):
                near = bvh.find_nearest_range(p, eps)
                if len(near) > 48: continue          # 수십 장이 한 점에 몰린 곳(겹겹이 쌓인 판)은 이미 설계 문제 — 여기서 시간을 쓰지 않는다
                for _, _, tj, _ in near:
                    if tj is None or tj == ti or tri_sets[ti] & tri_sets[tj]: continue
                    n2 = meta[tj][2]; d = n.dot(n2)
                    if abs(d) < 0.999: continue
                    a2, b2, c2 = (verts[i] for i in tris[tj]); q = p - n2 * n2.dot(p - a2)
                    if _in_tri(q, a2, b2, c2, n2):
                        (b2b if d < 0 else zf_blend if (meta[ti][3] or meta[tj][3]) else zf).add((min(ti, tj), max(ti, tj)))
        lap(f"zfight done pairs={len(zf)}")
        if DBG:
            for i, j in list(zf)[:6]:
                ci = sum((verts[k] for k in tris[i]), Vector()) / 3; cj = sum((verts[k] for k in tris[j]), Vector()) / 3
                print(f"ABM3D_QA_DEBUG {obs[meta[i][0]].name}#{i} mat_blended={meta[i][3]} ↔ {obs[meta[j][0]].name}#{j} mat_blended={meta[j][3]} dist={(ci - cj).length:.4f} n·n={meta[i][2].dot(meta[j][2]):.4f}")
        def by_pair(pairs):
            out = Counter()
            for i, j in pairs:
                x, y = obs[meta[i][0]].name, obs[meta[j][0]].name; out[f"{x}↔{y}" if x != y else x] += 1
            return out.most_common(8)
        note = "" if full and step == 1 else f" (표본 검사 — 삼각형 {step}개마다 {'4' if full else '1'}점)"
        okset = {tuple(sorted(x)) if isinstance(x, (tuple, list)) else x for x in ok}
        def allowed(k):
            names = k.split("↔"); return any(n in okset for n in names) or tuple(sorted(names)) in okset
        for k, c in by_pair(zf):
            if allowed(k): warns.append(f"허용된 겹침(qa_ok) {k}: {c}쌍")
            else: errors.append(f"겹침(z-fighting) {k}: 같은 방향 면 {c}쌍 — 법선 방향으로 {eps * 4:.3f} 이상 띄우거나 하나로 합친다, 의도면 run(qa_ok=)에{note}")
        for k, c in by_pair(zf_blend): warns.append(f"겹침(블렌드 재질) {k}: 같은 방향 면 {c}쌍 — progress·fade 덧칠처럼 의도면 그대로, 아니면 띄운다{note}")
        for k, c in by_pair(b2b): warns.append(f"맞댄 면 {k}: {c}쌍 — 보이지 않는 면, 지우거나 합친다")
        tri_island = [m[1] for m in meta]; floating = Counter()
        if len(island) > 1:
            biggest = max(island, key=lambda g: len(island[g]["verts"]))
            for g, info in island.items():
                if g == biggest: continue
                vs = list(info["verts"]); step = max(1, len(vs) // 400); touching = False
                for vi in vs[::step]:
                    if any(tj is not None and tri_island[tj] != g for _, _, tj, _ in bvh.find_nearest_range(verts[vi], tol)): touching = True; break
                if not touching and info["tris"]:
                    sub = BVHTree.FromPolygons(verts, [tris[t] for t in info["tris"]], epsilon=0.0)
                    touching = any(tri_island[j] != g for _, j in sub.overlap(bvh))
                if not touching: floating[info["ob"]] += 1
            lap("floating done")
            if floating: warns.append(f"떠 있는 조각 {sum(floating.values())}개 — " + ", ".join(f"{k}×{v}" if v > 1 else k for k, v in floating.most_common(8)) + " (입자·공중 주연처럼 의도면 run(ignore=) 에)")
    for e in errors: print(f"ABM3D_QA ✗ {e}")
    for w in warns: print(f"ABM3D_QA △ {w}")
    print(f"ABM3D_QA errors={len(errors)} warnings={len(warns)} objects={len(obs)} tris={len(tris)} eps={eps:.4f} tol={tol:.4f} median_size={med:.2f}")
    if strict and errors: raise RuntimeError(f"형태 QA 오류 {len(errors)}건 (ABM3D_QA_STRICT=1)")
    return {"errors": errors, "warnings": warns}


def render_review(out_dir, res=720, ignore=()):
    """형태 검수 스틸(Workbench) — 장면 카메라 1장(관객 시점 810×1440) + 정면·우측·위·3/4 (물체마다 다른 색 → 떨어진 조각·맞물림이 보인다).
    blender-render.sh --review 가 ffmpeg 로 sheet.png 로 묶는다. 룩 확인이 아니라 형태 확인용이다"""
    sc = bpy.context.scene; os.makedirs(out_dir, exist_ok=True); sc.frame_set(sc.frame_start)
    dg = bpy.context.evaluated_depsgraph_get(); obs = _qa_objects(ignore)
    # 틀 잡기: 바닥판·하늘처럼 거대한 물체(중앙값의 25배 초과)는 틀에서 뺀다 — 00051 에서 지면판 때문에 타워가 점으로 보였다
    def _box(ob):
        e = ob.evaluated_get(dg); return [e.matrix_world @ Vector(c) for c in e.bound_box]
    sizes = {ob.name: (lambda b: (Vector([max(q[i] for q in b) for i in range(3)]) - Vector([min(q[i] for q in b) for i in range(3)])).length)(_box(ob)) for ob in obs}
    med = sorted(sizes.values())[len(sizes) // 2] if sizes else 1.0
    framed = [ob for ob in obs if sizes[ob.name] <= 25 * med] or obs
    pts = [q for ob in framed for q in _box(ob)] or [Vector((0, 0, 0))]
    lo = Vector([min(p[i] for p in pts) for i in range(3)]); hi = Vector([max(p[i] for p in pts) for i in range(3)])
    center, radius = (lo + hi) / 2, max((hi - lo).length / 2, 1e-3)
    r = sc.render; r.engine = 'BLENDER_WORKBENCH'; r.film_transparent = False; r.resolution_percentage = 100
    r.image_settings.media_type = 'IMAGE'; r.image_settings.file_format = 'PNG'; r.image_settings.color_mode = 'RGB'
    sh = sc.display.shading; sh.light = 'STUDIO'; sh.color_type = 'RANDOM'; sh.show_cavity = True; sh.show_object_outline = True
    sc.view_settings.view_transform = 'Standard'
    n = 0
    if sc.camera:
        r.resolution_x, r.resolution_y = 810, 1440; r.filepath = os.path.join(out_dir, "v_camera.png"); bpy.ops.render.render(write_still=True); n += 1
    cd = bpy.data.cameras.new("qa_cam"); cd.lens = 50; cam = bpy.data.objects.new("qa_cam", cd); sc.collection.objects.link(cam); sc.camera = cam
    fov = 2 * math.atan(cd.sensor_width / (2 * cd.lens)); dist = radius / math.sin(fov / 2) * 1.05
    cd.clip_end = dist * 4; cd.clip_start = dist / 1000; r.resolution_x = r.resolution_y = res
    for name, d in (("front", (0, -1, 0.15)), ("right", (1, 0, 0.15)), ("top", (0, -0.001, 1)), ("three_quarter", (1, -1, 0.6))):
        d = Vector(d).normalized(); cam.location = center + d * dist; cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
        r.filepath = os.path.join(out_dir, f"v_{name}.png"); bpy.ops.render.render(write_still=True); n += 1
    print(f"ABM3D_REVIEW {n} → {out_dir}")


# ── 카메라·검사·앵커·렌더 ─────────────────────────────────────────────
def camera(loc, target, lens=50, ortho=None):
    cd = bpy.data.cameras.new("cam")
    if ortho: cd.type = 'ORTHO'; cd.ortho_scale = ortho
    else: cd.lens = lens
    cd.sensor_fit = 'VERTICAL'; cd.sensor_height = 36.0   # 세로 화면 기준 화각을 명시
    cam = bpy.data.objects.new("cam", cd); bpy.context.scene.collection.objects.link(cam)
    bpy.context.scene.camera = cam
    tgt = empty("cam_target", target)
    c = cam.constraints.new('TRACK_TO'); c.target = tgt
    c.track_axis = 'TRACK_NEGATIVE_Z'; c.up_axis = 'UP_Y'  # RNA 기본값은 TRACK_X — 반드시 명시
    cam.location = loc
    return cam, tgt


def check_camera():
    sc = bpy.context.scene; bad = []
    for f in range(sc.frame_start, sc.frame_end + 1, 3):
        sc.frame_set(f)
        for c in sc.camera.constraints:
            if not c.is_valid: bad.append(f)
    sc.frame_set(sc.frame_start)
    if bad: raise RuntimeError(f"카메라 제약 무효 프레임 {bad[:8]}… (TrackTo 축 평행)")
    print("ABM3D_CAMERA ok")


def _screen_bbox(ob, depsgraph, cam, sc):
    from bpy_extras.object_utils import world_to_camera_view
    ev = ob.evaluated_get(depsgraph)
    pts = [world_to_camera_view(sc, cam, ev.matrix_world @ Vector(c)) for c in ev.bound_box]
    xs = [p.x * W for p in pts]; ys = [(1 - p.y) * H for p in pts]
    return min(xs), min(ys), max(xs), max(ys)


def layout_check(times, zones, ignore=(), strict=False):
    """times(초)마다 보이는 메시의 화면 bbox 를 계산해 zones{이름:(x0,y0,x1,y1)} 과의 겹침을 보고.
    바운딩 박스는 보수적(실제 실루엣보다 크다) — 겹침 후보를 찾는 1차 검사다"""
    sc = bpy.context.scene; cam = sc.camera; fails = []
    for t in times:
        sc.frame_set(fr(t)); dg = bpy.context.evaluated_depsgraph_get()
        U = [9e9, 9e9, -9e9, -9e9]; hits = []
        for ob in sc.objects:
            if ob.type != 'MESH' or ob.hide_render or ob.name in ignore: continue
            if min(abs(v) for v in ob.matrix_world.to_scale()) < 0.02: continue   # 크기 0으로 숨긴 물체
            x0, y0, x1, y1 = _screen_bbox(ob, dg, cam, sc)
            U = [min(U[0], x0), min(U[1], y0), max(U[2], x1), max(U[3], y1)]
            for zn, (a, b, c, d) in zones.items():
                if x0 < c and x1 > a and y0 < d and y1 > b: hits.append(f"{ob.name}→{zn}")
        print(f"ABM3D_LAYOUT t={t:.2f} union=({U[0]:.0f},{U[1]:.0f},{U[2]:.0f},{U[3]:.0f}) hits={hits[:8]}")
        if hits: fails.append((t, hits))
    sc.frame_set(sc.frame_start)
    if strict and fails: raise RuntimeError(f"구역 침범 {fails[:3]}")
    return fails


def export_anchors(names, path):
    """names 의 오브젝트 원점 화면 좌표(1080×1920 px)를 프레임별로 기록 — HTML 라벨이 따라간다"""
    from bpy_extras.object_utils import world_to_camera_view
    sc = bpy.context.scene; cam = sc.camera; data = {n: [] for n in names}
    for f in range(sc.frame_start, sc.frame_end + 1):
        sc.frame_set(f)
        for n in names:
            v = world_to_camera_view(sc, cam, bpy.data.objects[n].matrix_world.translation)
            data[n].append([round(v.x * W, 1), round((1 - v.y) * H, 1)])
    doc = {"fps": FPS, "frame0_time": 0.0, "anchors": data}
    with open(path, 'w') as fh:
        json.dump(doc, fh)
    # HyperFrames 프레임이 <script src> 로 읽는 사본 (하위 컴포지션에서 동기 실행 실측 2026-09-23)
    name = os.path.basename(path).replace(".anchors.json", "")
    with open(path.replace(".json", ".js"), 'w') as fh:
        fh.write(f"window.__abm3d=window.__abm3d||{{}};window.__abm3d[{json.dumps(name)}]={json.dumps(doc)};\n")
    sc.frame_set(sc.frame_start)
    print(f"ABM3D_ANCHORS {len(names)} → {path}")


def render_stills(times, out_dir):
    """지정 시각만 PNG 로 (시안·검수용). 파일명 t_<초>.png"""
    sc = bpy.context.scene; os.makedirs(out_dir, exist_ok=True)
    for t in times:
        sc.frame_set(fr(t)); sc.render.filepath = os.path.join(out_dir, f"t_{t:05.2f}.png")
        bpy.ops.render.render(write_still=True)
    print(f"ABM3D_STILLS {len(times)} → {out_dir}")


def run(anchors=(), zones=None, check_times=None, ignore=(), qa_ok=()):
    """장면 스크립트 마지막에 부른다: 형태 QA(ABM3D_QA) → 카메라·레이아웃 검사 → (앵커) → 렌더 또는 스틸/검수 시트"""
    import time
    a = args()
    qa_check(ignore=ignore, strict=os.environ.get('ABM3D_QA_STRICT') == '1', ok=qa_ok)   # 카메라 검사 예외보다 먼저 — 형태 결과가 묻히지 않게
    check_camera()
    if a["review"]:
        render_review(a["out"], ignore=ignore); return
    if zones and check_times: layout_check(check_times, zones, ignore=ignore)
    if a["stills"]:
        render_stills(a["stills"], a["out"]); return
    if a["anchors_only"]:                      # 기준점만 다시 — 렌더·영상은 그대로 (빈 오브젝트는 렌더에 안 나온다)
        export_anchors(list(anchors), a["anchors"]); return
    if anchors and a["anchors"] and not a["preview"]: export_anchors(list(anchors), a["anchors"])
    t = time.time(); bpy.ops.render.render(animation=True)
    sc = bpy.context.scene; n = len(range(sc.frame_start, sc.frame_end + 1, sc.frame_step))
    print(f"ABM3D_RENDER frames={n} total={time.time() - t:.1f}s")
