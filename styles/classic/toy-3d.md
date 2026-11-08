# Toy and material 3D

**Good for:** coordinate frames, cameras and projection, kinematics, grasping, objects in a
scene (a robot cell), anything that is really 3D.

## Look

- Three.js, soft studio lighting: one large key light and a fill (`HemisphereLight` + one `DirectionalLight`).
- Pastel background `#f6e6e4`.
- Matte and soft-gloss materials (`MeshStandardMaterial`, roughness 0.4 to 0.7) in `#ff8fab`, `#7bdff2`, `#b2f7ef`, `#fcbf49`.
- Shallow depth of field on the hero object: keep other objects smaller, further back and paler (the software renderer has no real DOF pass).
- Axes for frames: x `#ff8fab`, y `#b2f7ef` darker `#3fbfae`, z `#7bdff2` darker `#3a9fd0`, as rounded cylinders.
- Labels are HTML text over the canvas (`s.text`), placed at projected points: `v.clone().project(camera)`.

## Motion

- Objects land with weight and two small settles (`E.settle(x, 2)`), always with a contact shadow (`ShadowMaterial` floor).
- Fixed seeds for any procedural geometry (`rng(seed)`).
- Camera moves are slow dollies or orbits of at most 30 degrees over 2 s or more.

## Avoid

Hard shadows, pure white or pure black, metallic chrome, fast camera spins, more than one shadow-casting light.

## Build

See the Three.js scene in `reference/engine.md`. Rotations: build them with matrices or
quaternions (`new THREE.Quaternion().setFromAxisAngle(...)`) and slerp between them; never
add Euler angles.
