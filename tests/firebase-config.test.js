import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const generatorPath = fileURLToPath(new URL('../apptolva_bitacora/js/generate-firebase-config.js', import.meta.url));
const runtimeSource = readFileSync(
  new URL('../apptolva_bitacora/js/firebase-config-runtime.js', import.meta.url),
  'utf8'
);
const demoConfigs = {
  staging: {
    apiKey: 'staging-test-key',
    authDomain: 'apptolva-staging.firebaseapp.com',
    projectId: 'apptolva-staging',
    messagingSenderId: '123456',
    appId: '1:123456:web:staging'
  },
  production: {
    apiKey: 'production-test-key',
    authDomain: 'apptolva-production.firebaseapp.com',
    projectId: 'apptolva-production',
    messagingSenderId: '654321',
    appId: '1:654321:web:production'
  }
};

function configFor(hostname) {
  const context = {
    __APPTOLVA_FIREBASE_CONFIGS__: {
      staging: { projectId: 'apptolva-staging' },
      production: { projectId: 'apptolva-production' }
    }
  };
  vm.runInNewContext(runtimeSource, context);
  return context.getAppFirebaseConfig(hostname);
}

test('selects staging for localhost and staging hosts', () => {
  assert.equal(configFor('localhost').projectId, 'apptolva-staging');
  assert.equal(configFor('127.0.0.1').projectId, 'apptolva-staging');
  assert.equal(configFor('[::1]').projectId, 'apptolva-staging');
  assert.equal(configFor('staging.apptolva.example').projectId, 'apptolva-staging');
  assert.equal(configFor('apptolva-staging.netlify.app').projectId, 'apptolva-staging');
  assert.equal(configFor('deploy-preview-42--apptolva.netlify.app').projectId, 'apptolva-staging');
});

test('selects production for other hosts', () => {
  assert.equal(configFor('apptolva.example.com').projectId, 'apptolva-production');
});

test('build context forces staging for branch deploys and production only for production context', () => {
  const configForContext = (contextoBuild, hostname) => {
    const context = {
      __APPTOLVA_BUILD_CONTEXT__: contextoBuild,
      __APPTOLVA_FIREBASE_CONFIGS__: {
        staging: { projectId: 'apptolva-staging' },
        production: { projectId: 'apptolva-production' }
      }
    };
    vm.runInNewContext(runtimeSource, context);
    return context.getAppFirebaseConfig(hostname).projectId;
  };
  assert.equal(configForContext('branch-deploy', 'rama--apptolva.netlify.app'), 'apptolva-staging');
  assert.equal(configForContext('deploy-preview', 'cualquier.netlify.app'), 'apptolva-staging');
  assert.equal(configForContext('production', 'apptolva.example.com'), 'apptolva-production');
  assert.equal(configForContext('production', 'localhost'), 'apptolva-staging');
});

test('reports a missing config instead of falling back to another project', () => {
  const context = { __APPTOLVA_FIREBASE_CONFIGS__: { production: { projectId: 'prod' } } };
  vm.runInNewContext(runtimeSource, context);
  assert.throws(() => context.getAppFirebaseConfig('staging.apptolva.example'), /staging/);
});

test('build generator emits separate public configs and rejects invalid environment data', (t) => {
  const outputDirectory = mkdtempSync(path.join(tmpdir(), 'apptolva-firebase-config-'));
  t.after(() => rmSync(outputDirectory, { recursive: true, force: true }));
  const outputPath = path.join(outputDirectory, 'firebase-config.js');
  const runGenerator = (configs) => spawnSync(process.execPath, [
    generatorPath,
    outputPath
  ], {
    encoding: 'utf8',
    env: {
      ...process.env,
      FIREBASE_STAGING_CONFIG_JSON: JSON.stringify(configs.staging),
      FIREBASE_PRODUCTION_CONFIG_JSON: JSON.stringify(configs.production)
    }
  });

  const generated = runGenerator(demoConfigs);
  assert.equal(generated.status, 0, generated.stderr);
  const context = {};
  vm.runInNewContext(readFileSync(outputPath, 'utf8'), context);
  vm.runInNewContext(runtimeSource, context);
  assert.equal(context.getAppFirebaseConfig('localhost').projectId, 'apptolva-staging');
  assert.equal(context.getAppFirebaseConfig('apptolva.example.com').projectId, 'apptolva-production');

  const sameProject = {
    staging: demoConfigs.staging,
    production: { ...demoConfigs.production, projectId: demoConfigs.staging.projectId }
  };
  const invalid = runGenerator(sameProject);
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /projectId distintos/);
});
