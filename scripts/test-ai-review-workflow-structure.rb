# frozen_string_literal: true

require 'yaml'

CHECKOUT_SHA = '11bd71901bbe5b1630ceea73d27597364c9af683'
GITHUB_SCRIPT_SHA = 'f28e40c7f34bde8b3046d885e986cb6290c5673b'


def trigger_key(workflow, label)
  keys = workflow.keys.select { |key| key == 'on' || key == true }
  raise "#{label} must contain exactly one on key: #{keys.inspect}" unless keys.length == 1

  keys.first
end


def assert_exact_keys(hash, expected, label)
  raise "#{label} must be a mapping" unless hash.is_a?(Hash)
  raise "unexpected #{label} keys: #{hash.keys.inspect}" unless hash.keys == expected
end

trusted = YAML.load_file('.github/workflows/ai-review-contract.yml')
trusted_on = trigger_key(trusted, 'trusted workflow')
assert_exact_keys(trusted, ['name', trusted_on, 'permissions', 'jobs'], 'trusted workflow')
raise "unexpected trusted workflow name: #{trusted['name'].inspect}" unless trusted['name'] == 'AI review contract'
raise "unexpected trusted permissions: #{trusted['permissions'].inspect}" unless trusted['permissions'] == {
  'actions' => 'read',
  'contents' => 'read',
  'issues' => 'read',
  'pull-requests' => 'read'
}
raise "unexpected trusted triggers: #{trusted[trusted_on].inspect}" unless trusted[trusted_on] == {
  'pull_request_target' => { 'types' => ['opened', 'synchronize', 'reopened'] }
}
assert_exact_keys(trusted['jobs'], ['verify'], 'trusted jobs')
trusted_job = trusted['jobs']['verify']
assert_exact_keys(trusted_job, ['name', 'runs-on', 'timeout-minutes', 'steps'], 'trusted verify job')
raise "unexpected trusted job name: #{trusted_job['name'].inspect}" unless trusted_job['name'] == 'Verify exact-head independent review'
raise "unexpected trusted runner: #{trusted_job['runs-on'].inspect}" unless trusted_job['runs-on'] == 'ubuntu-latest'
raise "unexpected trusted timeout: #{trusted_job['timeout-minutes'].inspect}" unless trusted_job['timeout-minutes'] == 17
expected_ref = '$' + '{{ github.sha }}'
expected_script = "const verify = require('./scripts/verify-ai-review-target-contract.cjs');\n// The trusted target runner imports ./scripts/verify-ai-review-contract.cjs from this same default-branch checkout.\nawait verify({ github, context, core });\n"
expected_trusted_steps = [
  {
    'name' => 'Check out trusted default-branch verifier',
    'uses' => "actions/checkout@#{CHECKOUT_SHA}",
    'with' => {
      'ref' => expected_ref,
      'fetch-depth' => 1,
      'persist-credentials' => false,
      'show-progress' => false
    }
  },
  {
    'name' => 'Wait for request-bound independent review evidence',
    'uses' => "actions/github-script@#{GITHUB_SCRIPT_SHA}",
    'with' => { 'script' => expected_script }
  }
]
raise "trusted verifier steps drifted: #{trusted_job['steps'].inspect}" unless trusted_job['steps'] == expected_trusted_steps

provider = YAML.load_file('.github/workflows/ai-review-provider-pool-contract.yml')
provider_on = trigger_key(provider, 'provider workflow')
assert_exact_keys(provider, ['name', provider_on, 'concurrency', 'permissions', 'jobs'], 'provider workflow')
raise "unexpected provider workflow name: #{provider['name'].inspect}" unless provider['name'] == 'AI review provider pool contract'
expected_paths = [
  '.github/workflows/ai-review-contract.yml',
  '.github/workflows/ai-review-provider-pool-contract.yml',
  'scripts/verify-ai-review-contract.cjs',
  'scripts/verify-ai-review-target-contract.cjs',
  'scripts/test-ai-review-provider-pool.cjs',
  'scripts/test-ai-review-target-contract.cjs',
  'scripts/test-ai-review-workflow-structure.rb',
  'docs/ai-review-cooperation-policy.md'
]
raise "unexpected provider triggers: #{provider[provider_on].inspect}" unless provider[provider_on] == {
  'pull_request' => { 'paths' => expected_paths }
}
raise "unexpected provider concurrency: #{provider['concurrency'].inspect}" unless provider['concurrency'] == {
  'group' => 'ai-review-provider-pool-contract-' + '$' + '{{ github.event.pull_request.number }}',
  'cancel-in-progress' => true
}
raise "unexpected provider permissions: #{provider['permissions'].inspect}" unless provider['permissions'] == { 'contents' => 'read' }
assert_exact_keys(provider['jobs'], ['verify'], 'provider jobs')
provider_job = provider['jobs']['verify']
assert_exact_keys(provider_job, ['name', 'runs-on', 'timeout-minutes', 'steps'], 'provider verify job')
raise "unexpected provider job name: #{provider_job['name'].inspect}" unless provider_job['name'] == 'Verify provider-pool contract'
raise "unexpected provider runner: #{provider_job['runs-on'].inspect}" unless provider_job['runs-on'] == 'ubuntu-latest'
raise "unexpected provider timeout: #{provider_job['timeout-minutes'].inspect}" unless provider_job['timeout-minutes'] == 5
expected_provider_steps = [
  {
    'name' => 'Checkout pull request',
    'uses' => "actions/checkout@#{CHECKOUT_SHA}",
    'with' => {
      'persist-credentials' => false,
      'show-progress' => false
    }
  },
  {
    'name' => 'Run provider-pool behavior contract',
    'run' => "node --check scripts/verify-ai-review-contract.cjs\nnode --check scripts/verify-ai-review-target-contract.cjs\nnode --check scripts/test-ai-review-provider-pool.cjs\nnode --check scripts/test-ai-review-target-contract.cjs\nnode scripts/test-ai-review-provider-pool.cjs\nnode scripts/test-ai-review-target-contract.cjs\n"
  },
  {
    'name' => 'Verify workflow structure and least privilege',
    'run' => "ruby scripts/test-ai-review-workflow-structure.rb\n"
  }
]
raise "provider verifier steps drifted: #{provider_job['steps'].inspect}" unless provider_job['steps'] == expected_provider_steps

puts 'workflow-structure contract: ok'
