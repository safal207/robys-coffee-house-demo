# frozen_string_literal: true

require 'open3'
require 'tempfile'
require 'yaml'

WORKFLOW = '.github/workflows/ai-review-cooperation.yml'
CHECKOUT_SHA = '11bd71901bbe5b1630ceea73d27597364c9af683'


def trigger_key(workflow)
  keys = workflow.keys.select { |key| key == 'on' || key == true }
  raise "expected exactly one on key: #{keys.inspect}" unless keys.length == 1

  keys.first
end


def normalize_expression(value)
  output = +''
  quote = nil
  escaped = false
  value.to_s.each_char do |char|
    if quote
      output << char
      if escaped
        escaped = false
      elsif char == '\\'
        escaped = true
      elsif char == quote
        quote = nil
      end
    elsif char == "'" || char == '"'
      quote = char
      output << char
    elsif char.match?(/\s/)
      next
    else
      output << char
    end
  end
  raise 'unterminated quoted literal' if quote

  output
end

workflow = YAML.load_file(WORKFLOW)
on_key = trigger_key(workflow)
raise 'unexpected workflow name' unless workflow['name'] == 'AI review cooperation report'
raise 'workflow permissions must default to none' unless workflow['permissions'] == {}
raise 'workflow-level concurrency is forbidden' if workflow.key?('concurrency')
raise 'unexpected triggers' unless workflow[on_key] == {
  'issue_comment' => { 'types' => ['created'] },
  'pull_request_review' => { 'types' => ['submitted'] },
  'workflow_run' => {
    'workflows' => ['AI review contract'],
    'types' => ['completed']
  }
}

job = workflow.dig('jobs', 'report')
raise 'missing report job' unless job.is_a?(Hash)
raise 'unexpected job permissions' unless job['permissions'] == {
  'actions' => 'read',
  'checks' => 'read',
  'contents' => 'read',
  'issues' => 'write',
  'pull-requests' => 'read'
}
raise 'unexpected runner' unless job['runs-on'] == 'ubuntu-latest'
raise 'unexpected timeout' unless job['timeout-minutes'] == 5

expected_guard = <<~'EXPR'
  (github.event_name == 'issue_comment' &&
   github.event.issue.pull_request != null &&
   github.event.comment.body == '/ai-cooperation report' &&
   (github.event.comment.author_association == 'OWNER' ||
    github.event.comment.author_association == 'MEMBER' ||
    github.event.comment.author_association == 'COLLABORATOR' ||
    github.event.comment.user.login == github.repository_owner)) ||
  (github.event_name == 'pull_request_review' &&
   github.event.review.state != 'pending' &&
   github.event.review.state != 'dismissed' &&
   github.event.review.commit_id == github.event.pull_request.head.sha &&
   github.event.review.user.type == 'Bot' &&
   (github.event.review.user.login == 'qodo-code-review' ||
    github.event.review.user.login == 'qodo-code-review[bot]' ||
    github.event.review.user.login == 'chatgpt-codex-connector' ||
    github.event.review.user.login == 'chatgpt-codex-connector[bot]')) ||
  (github.event_name == 'workflow_run' &&
   github.event.workflow_run.name == 'AI review contract' &&
   github.event.workflow_run.event == 'pull_request_target' &&
   github.event.workflow_run.conclusion == 'success' &&
   github.event.workflow_run.path == format('.github/workflows/ai-review-contract.yml@{0}', github.event.repository.default_branch) &&
   startsWith(github.event.workflow_run.display_title, 'AI review PR #') &&
   github.event.workflow_run.head_sha != '')
EXPR
raise 'job trigger guard drifted' unless normalize_expression(job['if']) == normalize_expression(expected_guard)

concurrency = job['concurrency']
raise 'cancel-in-progress must remain enabled' unless concurrency['cancel-in-progress'] == true
group = concurrency['group'].to_s
%w[
  github.event.workflow_run.id
  github.event.workflow_run.display_title
  github.event.workflow_run.path
  pull_request_target
  github.run_id
].each do |token|
  raise "concurrency trust partition missing #{token}" unless group.include?(token)
end

expected_env = {
  'DEFAULT_BRANCH' => 'github.event.repository.default_branch',
  'PR_NUMBER' => "github.event.issue.number || github.event.pull_request.number || ''",
  'WORKFLOW_RUN_ID' => "github.event.workflow_run.id || ''",
  'WORKFLOW_DISPLAY_TITLE' => "github.event.workflow_run.display_title || ''",
  'WORKFLOW_PATH' => "github.event.workflow_run.path || ''",
  'WORKFLOW_BASE_SHA' => "github.event.workflow_run.head_sha || ''",
  'TRIGGER_HEAD_SHA' => "github.event.review.commit_id || ''"
}
env = job['env']
expected_env.each do |key, token|
  raise "environment mapping drifted for #{key}" unless env.fetch(key, '').include?(token)
end
raise 'workflow-run PR must not come from pull_requests[0]' if env['PR_NUMBER'].include?('workflow_run.pull_requests')
raise 'workflow-run base SHA must not masquerade as target head' if env['TRIGGER_HEAD_SHA'].include?('workflow_run.head_sha')

steps = job['steps']
authorize = steps.first
raise 'authorization must remain first' unless authorize['name'] == 'Authorize cooperation trigger'
authorization = authorize['run'].to_s
required_authorization = [
  'pull_request_target', 'WORKFLOW_DISPLAY_TITLE', 'WORKFLOW_PATH', 'WORKFLOW_BASE_SHA',
  "run_title_re='^AI review PR #([1-9][0-9]*) head ([0-9a-f]{40})$'",
  'PR_NUMBER=${resolved_pr}', 'TRIGGER_HEAD_SHA=${target_head}', 'GITHUB_ENV'
]
missing = required_authorization.reject { |token| authorization.include?(token) }
raise "authorization contract incomplete: #{missing.inspect}" unless missing.empty?

base = {
  'REPOSITORY_OWNER' => 'repo-owner', 'REPOSITORY' => 'owner/repo',
  'DEFAULT_BRANCH' => 'main', 'TRIGGER_EVENT' => '', 'TRIGGER_AUTHOR' => '',
  'TRIGGER_ASSOCIATION' => '', 'REVIEW_STATE' => '', 'REVIEW_COMMIT' => '',
  'REVIEW_USER_TYPE' => '', 'PR_HEAD_SHA' => '', 'WORKFLOW_RUN_ID' => '',
  'WORKFLOW_NAME' => '', 'WORKFLOW_EVENT' => '', 'WORKFLOW_CONCLUSION' => '',
  'WORKFLOW_DISPLAY_TITLE' => '', 'WORKFLOW_PATH' => '', 'WORKFLOW_BASE_SHA' => '',
  'PR_NUMBER' => '', 'TRIGGER_HEAD_SHA' => ''
}
head = 'b' * 40
base_sha = 'a' * 40
cases = [
  ['trusted owner', true, {
    'TRIGGER_EVENT' => 'issue_comment', 'TRIGGER_AUTHOR' => 'member',
    'TRIGGER_ASSOCIATION' => 'OWNER'
  }],
  ['Qodo review', true, {
    'TRIGGER_EVENT' => 'pull_request_review', 'TRIGGER_AUTHOR' => 'qodo-code-review',
    'REVIEW_STATE' => 'commented', 'REVIEW_COMMIT' => head,
    'REVIEW_USER_TYPE' => 'Bot', 'PR_HEAD_SHA' => head
  }],
  ['trusted target run', true, {
    'TRIGGER_EVENT' => 'workflow_run', 'WORKFLOW_RUN_ID' => '77',
    'WORKFLOW_NAME' => 'AI review contract', 'WORKFLOW_EVENT' => 'pull_request_target',
    'WORKFLOW_CONCLUSION' => 'success',
    'WORKFLOW_DISPLAY_TITLE' => "AI review PR #211 head #{head}",
    'WORKFLOW_PATH' => '.github/workflows/ai-review-contract.yml@main',
    'WORKFLOW_BASE_SHA' => base_sha
  }],
  ['legacy pull request run', false, {
    'TRIGGER_EVENT' => 'workflow_run', 'WORKFLOW_RUN_ID' => '77',
    'WORKFLOW_NAME' => 'AI review contract', 'WORKFLOW_EVENT' => 'pull_request',
    'WORKFLOW_CONCLUSION' => 'success',
    'WORKFLOW_DISPLAY_TITLE' => "AI review PR #211 head #{head}",
    'WORKFLOW_PATH' => '.github/workflows/ai-review-contract.yml@main',
    'WORKFLOW_BASE_SHA' => base_sha
  }],
  ['title with wrong head shape', false, {
    'TRIGGER_EVENT' => 'workflow_run', 'WORKFLOW_RUN_ID' => '77',
    'WORKFLOW_NAME' => 'AI review contract', 'WORKFLOW_EVENT' => 'pull_request_target',
    'WORKFLOW_CONCLUSION' => 'success', 'WORKFLOW_DISPLAY_TITLE' => 'AI review PR #211 head deadbeef',
    'WORKFLOW_PATH' => '.github/workflows/ai-review-contract.yml@main',
    'WORKFLOW_BASE_SHA' => base_sha
  }],
  ['wrong workflow path', false, {
    'TRIGGER_EVENT' => 'workflow_run', 'WORKFLOW_RUN_ID' => '77',
    'WORKFLOW_NAME' => 'AI review contract', 'WORKFLOW_EVENT' => 'pull_request_target',
    'WORKFLOW_CONCLUSION' => 'success',
    'WORKFLOW_DISPLAY_TITLE' => "AI review PR #211 head #{head}",
    'WORKFLOW_PATH' => '.github/workflows/other.yml@main',
    'WORKFLOW_BASE_SHA' => base_sha
  }]
]
Tempfile.create(['cooperation-auth', '.sh']) do |file|
  file.write(authorization)
  file.flush
  File.chmod(0o700, file.path)
  cases.each do |name, expected, values|
    env_file = Tempfile.new('github-env')
    _out, err, status = Open3.capture3(base.merge(values).merge('GITHUB_ENV' => env_file.path), 'bash', file.path)
    env_file.close!
    raise "authorization matrix failed for #{name}: #{err}" unless status.success? == expected
  end
end

checkout = steps.find { |step| step['name'] == 'Checkout trusted reporter code' }
raise 'missing trusted reporter checkout' unless checkout
raise 'checkout action drifted' unless checkout['uses'] == "actions/checkout@#{CHECKOUT_SHA}"
raise 'reporter checkout must use default branch' unless checkout.dig('with', 'ref').to_s.include?('default_branch')
raise 'checkout credentials must remain disabled' unless checkout.dig('with', 'persist-credentials') == false

resolver = steps.find { |step| step['name'] == 'Resolve workflow-run pull request' }&.fetch('run', '').to_s
required_resolver = [
  'pulls/${PR_NUMBER}', '.state == "open"', '.head.sha == $sha',
  '.base.repo.full_name == $repo', 'TRIGGER_HEAD_SHA', 'WORKFLOW_BASE_SHA'
]
missing = required_resolver.reject { |token| resolver.include?(token) }
raise "resolver contract incomplete: #{missing.inspect}" unless missing.empty?
raise 'legacy commit-to-PR resolver remains active' if resolver.include?('commits/${TRIGGER_HEAD_SHA}/pulls')

collector = steps.find { |step| step['name'] == 'Collect exact-head REST evidence' }&.fetch('run', '').to_s
raise 'collector lost target-head recheck' unless collector.include?('Trusted run title is not bound to the current PR head')
raise 'status API must remain unused' if collector.include?('/statuses?')
raise 'empty compatibility status evidence missing' unless collector.include?("printf '[]\\n' > \"${STATUSES_FILE}\"")

fetcher = File.read('scripts/fetch-review-threads.py', encoding: 'UTF-8')
[
  %q{expected_title = f'AI review PR #{pr_number} head {expected_head}'},
  %q{expected_path = f'.github/workflows/ai-review-contract.yml@{default_branch}'},
  "'trusted_base_sha'",
  "'pull_request_target'",
  'Trusted target workflow metadata drift',
  'bound to the exact PR head'
].each do |token|
  raise "workflow normalizer missing #{token}" unless fetcher.include?(token)
end

raise 'workflow requests status permission' if File.read(WORKFLOW).include?('statuses: read')
raise 'workflow checks out PR code' if File.read(WORKFLOW).include?('github.event.pull_request.head.sha') && checkout.to_s.include?('head.sha')

puts 'cooperation-workflow contract: ok'
