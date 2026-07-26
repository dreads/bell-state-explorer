import {
  densityMatrix,
  concurrence,
  purity,
  outcomeProbabilities,
  bellFromInput,
  stateLabel,
  stateEquation,
  partialTrace0,
  partialTrace1,
  blochVector,
  applyLocalRotation,
} from './state.js';

// Export format version, independent of the app's own version. Bump this
// (and schema/bell-state-export.schema.json) together on any breaking change
// to the shape below.
export const SCHEMA_VERSION = '1.0.0';

export const SCHEMA_URL =
  'https://raw.githubusercontent.com/dreads/bell-state-explorer/main/schema/bell-state-export.schema.json';

/**
 * Build a schema-conforming snapshot of the current settings and every
 * derived measurement, for external validation of the physics.
 * `now` is injectable for deterministic tests; defaults to the real clock.
 *
 * @param {{q0:number, q1:number, theta:number, dephasing:number, rotation0:number, rotation1:number}} model
 * @param {Date} [now]
 */
export function buildExportPayload(model, now = new Date()) {
  const { psi, negative } = bellFromInput(model.q0, model.q1);
  const baseRho = densityMatrix({
    psi,
    negative,
    theta: model.theta,
    dephasing: model.dephasing,
  });
  const rho = applyLocalRotation(
    applyLocalRotation(baseRho, model.rotation0, 0),
    model.rotation1, 1,
  );

  return {
    $schema: SCHEMA_URL,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    settings: {
      q0: model.q0,
      q1: model.q1,
      thetaRadians: model.theta,
      dephasing: model.dephasing,
      rotation0Radians: model.rotation0,
      rotation1Radians: model.rotation1,
    },
    bellState: {
      label: stateLabel({ psi, negative }),
      equation: stateEquation({ psi, negative }),
      psi,
      negative,
    },
    measurements: {
      // Concurrence uses the pre-rotation Bell state (see app.js render()):
      // the Bell-state formula only applies to that structure, and local
      // rotations preserve entanglement, so it's still valid for the
      // rotated state reported alongside it.
      densityMatrix: rho,
      concurrence: concurrence(baseRho),
      purity: purity(rho),
      outcomeProbabilities: outcomeProbabilities(rho),
      blochVectorQ0: blochVector(partialTrace0(rho)),
      blochVectorQ1: blochVector(partialTrace1(rho)),
    },
  };
}
