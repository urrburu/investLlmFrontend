const DEFAULT_BASE_URL =
  import.meta.env.VITE_INVEST_API_BASE_URL || 'http://127.0.0.1:8000'

export const endpointCatalog = {
  health: { method: 'GET', path: '/health', backendReady: true },
  enums: { method: 'GET', path: '/contracts/enums', backendReady: true },
  languageCheck: {
    method: 'POST',
    path: '/verification/language-check',
    backendReady: true,
  },
  rescueExample: {
    method: 'GET',
    path: '/verification/rescue-example',
    backendReady: true,
  },
  sourceUpload: {
    method: 'POST',
    path: '/sources/upload',
    backendReady: false,
  },
  portfolioReview: {
    method: 'POST',
    path: '/reports/portfolio-review',
    backendReady: false,
  },
  wikiRevisionAction: {
    method: 'POST',
    path: '/wiki/revisions/{revision_id}/review',
    backendReady: false,
  },
  marketBrief: {
    method: 'POST',
    path: '/reports/market-brief',
    backendReady: false,
  },
  stockSnapshot: {
    method: 'POST',
    path: '/reports/stock-snapshot',
    backendReady: false,
  },
  runState: {
    method: 'GET',
    path: '/runs/{run_id}',
    backendReady: false,
  },
}

export const stateModes = ['success', 'partial', 'empty', 'error', 'loading']

const now = () => new Date().toISOString()

const pause = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms))

const clone = (value) => JSON.parse(JSON.stringify(value))

const sourceRefs = [
  {
    source_id: 'source_manual_portfolio_csv',
    source_type: 'document',
    citation_label: '수동 포트폴리오 CSV',
    as_of: '2026-06-28T09:00:00+09:00',
  },
  {
    source_id: 'price_api_2026_06_28',
    source_type: 'external',
    citation_label: '가격 API',
    as_of: '2026-06-28T09:00:00+09:00',
  },
]

function createMeta(endpointKey, source, durationMs, statusCode = 200) {
  const endpoint = endpointCatalog[endpointKey]

  return {
    endpointKey,
    method: endpoint.method,
    path: endpoint.path,
    backendReady: endpoint.backendReady,
    source,
    durationMs,
    statusCode,
    calledAt: now(),
  }
}

async function callBackend(baseUrl, endpointKey, options = {}) {
  const startedAt = performance.now()
  const endpoint = endpointCatalog[endpointKey]
  const response = await fetch(`${baseUrl}${endpoint.path}`, {
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  })

  const text = await response.text()
  const data = text ? JSON.parse(text) : null
  const durationMs = Math.round(performance.now() - startedAt)

  if (!response.ok) {
    const error = new Error(`HTTP ${response.status}`)
    error.response = data
    error.statusCode = response.status
    error.durationMs = durationMs
    throw error
  }

  return {
    meta: createMeta(endpointKey, 'backend', durationMs, response.status),
    data,
  }
}

async function fixtureResponse(endpointKey, factory, input = {}, delayMs = 160) {
  const startedAt = performance.now()
  await pause(delayMs)

  return {
    meta: createMeta(
      endpointKey,
      'spec_fixture',
      Math.round(performance.now() - startedAt),
    ),
    data: factory(input),
  }
}

async function backendOrFixture(baseUrl, endpointKey, options, factory, input) {
  if (!endpointCatalog[endpointKey].backendReady) {
    return fixtureResponse(endpointKey, factory, input)
  }

  try {
    return await callBackend(baseUrl, endpointKey, options)
  } catch (error) {
    return {
      meta: createMeta(
        endpointKey,
        'fallback_after_backend_error',
        error.durationMs || 0,
        error.statusCode || 0,
      ),
      data: factory(input),
      error: error.response || error.message,
    }
  }
}

function buildRunStateFixture({
  mode = 'success',
  runId = 'run_portfolio_2026_06_28',
  agentName = 'portfolio_review_agent',
  artifactIds = ['report_portfolio_001', 'verify_report_001'],
} = {}) {
  const statusByMode = {
    success: 'completed',
    partial: 'needs_human_review',
    empty: 'completed',
    error: 'blocked',
    loading: 'running',
  }

  return {
    run_id: runId,
    agent_name: agentName,
    trigger_type: 'manual',
    started_at: '2026-06-28T09:00:00+09:00',
    current_node:
      mode === 'loading'
        ? 'run_verification_graph'
        : mode === 'error'
          ? 'return_blocked_with_reasons'
          : 'format_response',
    last_event_at: now(),
    progress_label:
      mode === 'loading'
        ? '숫자, 출처, 금지 표현 검증을 진행 중입니다.'
        : mode === 'error'
          ? '검증 실패로 최종 출력 승격을 차단했습니다.'
          : 'artifact와 검증 결과가 연결되었습니다.',
    status: statusByMode[mode],
    verification_status:
      mode === 'error'
        ? 'blocked'
        : mode === 'partial'
          ? 'needs_human_review'
          : mode === 'loading'
            ? 'pending'
            : 'passed',
    warnings:
      mode === 'partial'
        ? ['공시 API 응답이 없어 filing_summary 섹션을 숨겼습니다.']
        : [],
    missing_inputs:
      mode === 'error'
        ? ['최신 포트폴리오 CSV 또는 market_value 계산 로그']
        : [],
    blocked_reasons:
      mode === 'error'
        ? ['AAPL market_value와 total_portfolio_value 계산 입력이 일치하지 않습니다.']
        : [],
    artifact_ids: mode === 'empty' ? [] : artifactIds,
  }
}

function buildSourceUploadFixture({ mode = 'success', title = '손실 리뷰 메모' } = {}) {
  if (mode === 'empty') {
    return {
      status: 'empty',
      message: '업로드된 원문이 없습니다.',
      next_actions: ['첫 원문을 선택하거나 메모 텍스트를 붙여넣습니다.'],
      documents: [],
    }
  }

  const failedDocument = {
    filename: 'broker_report_scan.pdf',
    error_code: 'SOURCE_PARSE_FAILED',
    message: '이미지 스캔 문서에서 본문 텍스트를 추출하지 못했습니다.',
  }

  return {
    status: mode === 'error' ? 'failed' : mode === 'partial' ? 'partial' : 'success',
    parsing_stage: mode === 'loading' ? 'chunk_document' : 'completed',
    documents:
      mode === 'error'
        ? []
        : [
            {
              document_id: 'doc_loss_review_2026_05',
              document_type: 'journal',
              title,
              author_or_source: 'manual_upload',
              created_at: now(),
              published_at: '2026-05-31T21:00:00+09:00',
              raw_location: 'uploads/loss-review.md',
              metadata: { tags: ['loss_review', 'concentration'] },
            },
          ],
    chunks:
      mode === 'error'
        ? []
        : [
            {
              chunk_id: 'chunk_loss_review_001',
              document_id: 'doc_loss_review_2026_05',
              citation_label: '손실 리뷰 메모 p.1',
              page_or_offset: 'paragraph:1-4',
            },
            {
              chunk_id: 'chunk_loss_review_002',
              document_id: 'doc_loss_review_2026_05',
              citation_label: '손실 리뷰 메모 p.2',
              page_or_offset: 'paragraph:5-7',
            },
          ],
    failed_documents: mode === 'partial' || mode === 'error' ? [failedDocument] : [],
    run_state: buildRunStateFixture({
      mode,
      runId: 'run_source_ingest_001',
      agentName: 'wiki_indexing_agent',
      artifactIds: ['doc_loss_review_2026_05', 'chunk_loss_review_001'],
    }),
  }
}

function buildPortfolioFixture({ mode = 'success' } = {}) {
  if (mode === 'empty') {
    return {
      status: 'empty',
      message: '포트폴리오 snapshot이 없습니다.',
      required_inputs: ['ticker, quantity, market_value 컬럼이 있는 CSV를 업로드합니다.'],
      sample_schema: ['ticker', 'quantity', 'market_price', 'market_value', 'sector'],
      run_state: buildRunStateFixture({ mode }),
    }
  }

  if (mode === 'error') {
    return {
      status: 'blocked',
      rescue: buildRescueFixture({ mode: 'error' }),
      run_state: buildRunStateFixture({ mode }),
    }
  }

  const verificationStatus = mode === 'partial' ? 'needs_human_review' : 'passed'

  return {
    status: verificationStatus,
    report: {
      report_id: 'report_portfolio_001',
      report_type: 'portfolio_report',
      title: '포트폴리오 점검 리포트',
      as_of: '2026-06-28T09:00:00+09:00',
      verification_status: verificationStatus,
      source_refs: sourceRefs,
      sections: [
        {
          section_id: 'top_checks',
          title: '먼저 볼 3가지',
          status: verificationStatus,
          display_order: 1,
          source_refs: [sourceRefs[0]],
          body: '기술 섹터 비중, AAPL 집중도, 공시 API 누락 여부를 먼저 확인합니다.',
        },
        {
          section_id: 'portfolio_weights',
          title: '포트폴리오 상태',
          status: verificationStatus,
          display_order: 2,
          source_refs: sourceRefs,
          body: '총 평가금액, 현금 비중, 최대 단일 종목 비중을 계산했습니다.',
        },
        {
          section_id: 'filing_summary',
          title: '공시 요약',
          status: mode === 'partial' ? 'needs_human_review' : 'passed',
          display_order: 3,
          source_refs: [],
          hidden_reason:
            mode === 'partial' ? '공시 API가 응답하지 않아 뉴스 기반 주장 생성을 제한했습니다.' : null,
        },
      ],
      actions: [
        {
          action_id: 'act_confirm_aapl_weight',
          label: 'AAPL 30% 초과 예외 근거를 남깁니다',
          action_type: 'select',
          required_input_schema: { reason: 'string' },
        },
        {
          action_id: 'act_retry_filings',
          label: '공시 API를 다시 조회합니다',
          action_type: 'retry',
          required_input_schema: { source: 'filings_api' },
        },
      ],
    },
    snapshot: {
      snapshot_id: 'portfolio_2026_06_28',
      as_of: '2026-06-28T09:00:00+09:00',
      base_currency: 'USD',
      cash: 1200,
      source_refs: [sourceRefs[0]],
      holdings: [
        {
          ticker: 'AAPL',
          name: 'Apple Inc.',
          quantity: 10,
          market_price: 195.2,
          market_value: 1952,
          weight: 0.34,
          sector: 'Technology',
          data_status: 'complete',
        },
        {
          ticker: 'MSFT',
          name: 'Microsoft Corp.',
          quantity: 4,
          market_price: 400,
          market_value: 1600,
          weight: 0.279,
          sector: 'Technology',
          data_status: mode === 'partial' ? 'partial' : 'complete',
        },
      ],
    },
    verification: {
      verification_result_id: 'verify_report_001',
      target_id: 'report_portfolio_001',
      status: verificationStatus,
      quality_score: mode === 'partial' ? 72 : 91,
      number_checks: [
        {
          field: 'holdings[0].weight',
          status: 'passed',
          calculation: 'market_value / total_portfolio_value',
          generated_at: '2026-06-28T09:00:01+09:00',
        },
      ],
      citation_checks:
        mode === 'partial'
          ? [
              {
                claim_id: 'claim_filing_summary',
                status: 'missing',
                error_code: 'MISSING_CITATION',
              },
            ]
          : [{ claim_id: 'claim_top_checks', status: 'passed' }],
      language_checks: [],
      staleness_checks: [],
      required_fixes:
        mode === 'partial'
          ? ['filing_summary에 source_refs를 추가하거나 해당 섹션을 숨깁니다.']
          : [],
      required_inputs:
        mode === 'partial' ? ['공시 URL을 직접 제공하거나 공시 API를 재시도합니다.'] : [],
      safe_sections: ['top_checks', 'portfolio_weights'],
      hidden_sections: mode === 'partial' ? ['filing_summary'] : [],
    },
    checks: [
      '기술 섹터 비중이 55%입니다. 내 집중도 규칙과 비교가 필요합니다.',
      'AAPL 비중이 34.0%입니다. 30% 초과 예외 근거가 있는지 확인합니다.',
      mode === 'partial'
        ? '공시 API 누락으로 공시 기반 판단을 보류합니다.'
        : '금지 표현 검사에서 차단 항목이 없습니다.',
    ],
    conflicts: [
      {
        rule: '단일 종목 30% 초과 시 재점검',
        current_state: 'AAPL 34.0%',
        judgment: '확인 필요',
      },
    ],
    run_state: buildRunStateFixture({ mode }),
  }
}

function buildWikiRevisionFixture({
  mode = 'success',
  reviewAction = 'approve',
  requestedChanges = '30% 초과 조건의 예외 기록 기준을 더 명확히 적습니다.',
} = {}) {
  if (mode === 'empty') {
    return {
      status: 'empty',
      message: '검토할 revision이 없습니다.',
      revisions: [],
      run_state: buildRunStateFixture({ mode }),
    }
  }

  const status =
    mode === 'error'
      ? 'needs_human_review'
      : reviewAction === 'approve'
        ? 'accepted'
        : reviewAction === 'reject'
          ? 'rejected'
          : 'needs_human_review'

  return {
    revision: {
      revision_id: 'rev_2026_06_28_001',
      page_id: 'wiki_rules_concentration',
      operation: 'update',
      status: mode === 'success' && reviewAction === 'approve' ? 'accepted' : status,
      change_summary:
        '단일 종목 집중도 규칙에 30% 초과 시 다음 점검에서 예외 근거를 기록하는 조건을 추가합니다.',
      before_refs: ['wiki_rules_concentration:current'],
      after_refs: ['source_book_001_chunk_032', 'journal_2026_05_loss_review'],
      diff_summary: {
        before: '단일 종목 집중도는 주기적으로 확인한다.',
        after:
          '단일 종목 비중이 30%를 초과하면 다음 점검에서 예외 근거를 기록한다.',
        changed_fields: ['body', 'source_refs', 'open_questions'],
      },
      proposed_body:
        '단일 종목 비중이 30%를 초과하면 다음 점검에서 예외 근거를 기록하고, 손실 리뷰 메모와 비교한다.',
      source_refs: [
        {
          source_id: 'source_book_001_chunk_032',
          source_type: 'chunk',
          citation_label: '투자 원칙 노트 32',
        },
        {
          source_id: 'journal_2026_05_loss_review',
          source_type: 'document',
          citation_label: '2026-05 손실 리뷰',
        },
      ],
      review_actions: [
        {
          action: reviewAction,
          reviewer: 'admin',
          requested_changes:
            reviewAction === 'request_changes' ? [requestedChanges] : [],
          created_at: now(),
        },
      ],
      requested_changes:
        reviewAction === 'request_changes' ? [requestedChanges] : [],
      created_by_agent: 'wiki_indexing_agent',
      created_at: '2026-06-28T09:04:00+09:00',
    },
    verification: {
      verification_result_id: 'verify_revision_001',
      target_id: 'rev_2026_06_28_001',
      status: mode === 'error' ? 'needs_human_review' : 'passed',
      quality_score: mode === 'error' ? 68 : 94,
      citation_checks: [
        {
          gate: 'citation',
          status: mode === 'error' ? 'needs_human_review' : 'passed',
          memo:
            mode === 'error'
              ? '두 번째 문장에 직접 source_refs가 필요합니다.'
              : '모든 주장에 source_refs가 있습니다.',
        },
      ],
      language_checks: [
        {
          gate: 'unsupported_claims',
          status: 'passed',
          memo: '추천 표현이 없습니다.',
        },
      ],
      required_inputs:
        mode === 'error' ? ['두 번째 문장의 근거 chunk를 선택합니다.'] : [],
      safe_sections: mode === 'error' ? ['change_summary', 'diff_summary'] : [],
      hidden_sections: mode === 'error' ? ['proposed_body'] : [],
    },
    available_actions: ['approve', 'reject', 'request_changes'],
    run_state: buildRunStateFixture({
      mode: mode === 'error' ? 'partial' : mode,
      runId: 'run_revision_review_001',
      agentName: 'wiki_indexing_agent',
      artifactIds: ['rev_2026_06_28_001', 'verify_revision_001'],
    }),
  }
}

function buildRescueFixture({ mode = 'error' } = {}) {
  const status = mode === 'partial' ? 'needs_human_review' : 'blocked'

  return {
    verification_status: status,
    error_code: mode === 'partial' ? 'PARTIAL_EXTERNAL_OUTAGE' : 'NUMBER_MISMATCH',
    message:
      mode === 'partial'
        ? '가격 데이터는 조회했지만 공시 API가 응답하지 않았습니다.'
        : '포트폴리오 비중 계산 결과가 원천 데이터와 일치하지 않습니다.',
    blocked_reasons:
      mode === 'partial'
        ? []
        : ['AAPL market_value=1952.0 이지만 계산 로그에는 1900.0으로 기록되어 있습니다.'],
    warnings:
      mode === 'partial'
        ? ['공시 기반 주장은 생성하지 않았습니다.', '뉴스 기반 요약에는 source_refs를 표시해야 합니다.']
        : [],
    required_inputs:
      mode === 'partial'
        ? ['공시 API를 재시도하거나 공시 URL을 직접 제공합니다.']
        : ['최신 포트폴리오 CSV를 다시 업로드하거나 market_value 계산 로그를 확인합니다.'],
    safe_sections: mode === 'partial' ? ['price_summary'] : [],
    hidden_sections:
      mode === 'partial'
        ? ['filing_summary', 'thesis_change_check']
        : ['portfolio_weights', 'return_summary'],
  }
}

function buildMarketBriefFixture({ mode = 'success' } = {}) {
  if (mode === 'empty') {
    return {
      status: 'empty',
      message: '시장 데이터 공급원이 설정되지 않았습니다.',
      required_inputs: ['시장 지수, 금리, VIX 데이터 공급원을 설정합니다.'],
      run_state: buildRunStateFixture({ mode }),
    }
  }

  if (mode === 'error') {
    return {
      status: 'blocked',
      rescue: {
        ...buildRescueFixture({ mode: 'partial' }),
        error_code: 'STALE_MARKET_DATA',
        message: '시장 지표 기준일이 오래되어 국면 판단을 보류했습니다.',
      },
      run_state: buildRunStateFixture({ mode }),
    }
  }

  return {
    report: {
      report_id: 'report_market_001',
      report_type: 'market_brief',
      title: '시황 브리프',
      as_of: '2026-06-28T08:30:00+09:00',
      verification_status: mode === 'partial' ? 'needs_human_review' : 'passed',
    },
    regime: mode === 'partial' ? 'mixed' : 'risk_on',
    summary:
      mode === 'partial'
        ? '지수와 VIX 신호가 엇갈려 혼합 국면으로 표시합니다.'
        : '시장 breadth와 VIX 안정이 위험자산 선호 쪽으로 기울었지만 포트폴리오 노출 확인이 필요합니다.',
    signals: [
      { label: 'S&P 500 breadth', value: '64%', interpretation: '상승 시나리오' },
      { label: 'VIX', value: '14.8', interpretation: '확인 필요' },
      { label: '10Y yield', value: '4.18%', interpretation: '반대 시나리오' },
    ],
    portfolio_connection:
      mode === 'partial'
        ? '포트폴리오 연결이 누락되어 시황만 표시합니다.'
        : '기술 섹터 55% 노출과 성장주 강세 신호를 함께 확인합니다.',
    source_refs: [
      {
        source_id: 'market_indices_2026_06_28',
        source_type: 'external',
        citation_label: '시장 지수 API',
        as_of: '2026-06-28T08:30:00+09:00',
      },
    ],
    run_state: buildRunStateFixture({
      mode: mode === 'partial' ? 'partial' : 'success',
      runId: 'run_market_001',
      agentName: 'market_regime_agent',
      artifactIds: ['report_market_001'],
    }),
  }
}

function buildStockSnapshotFixture({ mode = 'success', ticker = 'AAPL' } = {}) {
  if (mode === 'empty') {
    return {
      status: 'empty',
      message: '분석 이력이 없습니다.',
      required_inputs: ['ticker 또는 회사명을 입력합니다.'],
      run_state: buildRunStateFixture({ mode }),
    }
  }

  if (mode === 'error' || ticker.toUpperCase() === 'BRK') {
    return {
      status: 'needs_human_review',
      error_code: 'AMBIGUOUS_TICKER',
      message: '요청한 ticker가 여러 종목과 일치합니다.',
      questions: [
        {
          question: '분석할 종목을 선택해 주세요.',
          candidates: [
            { ticker: 'BRK.A', name: 'Berkshire Hathaway Inc. Class A', exchange: 'NYSE' },
            { ticker: 'BRK.B', name: 'Berkshire Hathaway Inc. Class B', exchange: 'NYSE' },
          ],
        },
      ],
      hidden_sections: ['stock_snapshot'],
      run_state: buildRunStateFixture({ mode: 'partial' }),
    }
  }

  return {
    report: {
      report_id: `report_snapshot_${ticker.toLowerCase()}`,
      report_type: 'stock_snapshot',
      title: `${ticker.toUpperCase()} 종목 Snapshot`,
      as_of: '2026-06-28T09:00:00+09:00',
      verification_status: mode === 'partial' ? 'needs_human_review' : 'passed',
    },
    ticker: ticker.toUpperCase(),
    thesis_changes: [
      '서비스 매출 비중 변화가 기존 thesis의 마진 전제에 영향을 줄 수 있습니다.',
      mode === 'partial'
        ? '공시 누락으로 뉴스 기반 주장에는 확인 라벨을 붙였습니다.'
        : '최근 공시와 가격 데이터 기준으로 차단 항목이 없습니다.',
    ],
    related_rules: ['단일 종목 30% 초과 시 재점검', '뉴스 단독 thesis 변경 금지'],
    source_summaries: [
      {
        source_id: 'filing_10q_2026_q2',
        summary: mode === 'partial' ? '공시 API 누락' : '서비스 매출 성장률과 비용 구조 확인',
        status: mode === 'partial' ? 'needs_human_review' : 'passed',
      },
      {
        source_id: 'news_cluster_2026_06_28',
        summary: '신제품 관련 뉴스는 thesis 변경 근거가 아니라 확인 질문으로만 사용',
        status: 'passed',
      },
    ],
    questions: [
      '서비스 매출 변화가 기존 마진 thesis를 바꾸는 충분한 근거입니까?',
      'AAPL 비중 30% 초과를 예외로 둘 기록이 있습니까?',
    ],
    run_state: buildRunStateFixture({
      mode: mode === 'partial' ? 'partial' : 'success',
      runId: 'run_snapshot_001',
      agentName: 'stock_snapshot_agent',
      artifactIds: [`report_snapshot_${ticker.toLowerCase()}`],
    }),
  }
}

function buildLanguageCheckFixture({ text = '' } = {}) {
  const forbidden = ['매수', '매도', '목표가', '보장', '반드시 오른다']
  const checks = forbidden
    .filter((word) => text.includes(word))
    .map((word) => ({
      status: 'blocked',
      error_code: 'UNSUPPORTED_RECOMMENDATION',
      matched_text: word,
      replacement_hint: '확인 질문 또는 조건형 표현으로 바꿉니다.',
    }))

  return {
    verification_status: checks.length ? 'blocked' : 'passed',
    checks,
    required_fixes: checks.length
      ? ['매수/매도 지시, 목표가, 보장 표현을 확인 질문 또는 조건형 표현으로 바꿉니다.']
      : [],
  }
}

export function createAdminSpecApi(baseUrl = DEFAULT_BASE_URL) {
  return {
    baseUrl,
    getHealth() {
      return backendOrFixture(
        baseUrl,
        'health',
        {},
        () => ({ status: 'ok', source: 'fixture' }),
        {},
      )
    },
    getEnums() {
      return backendOrFixture(
        baseUrl,
        'enums',
        {},
        () => ({
          verification_status: ['pending', 'passed', 'needs_revision', 'needs_human_review', 'blocked'],
          wiki_revision_status: ['draft', 'verified', 'needs_human_review', 'rejected', 'accepted'],
          run_status: ['running', 'completed', 'needs_human_review', 'blocked', 'failed'],
          trigger_type: ['manual', 'schedule', 'upload', 'follow_up'],
          revision_review_action: ['approve', 'reject', 'request_changes'],
          error_code: [
            'SOURCE_PARSE_FAILED',
            'MISSING_CITATION',
            'NUMBER_MISMATCH',
            'STALE_MARKET_DATA',
            'AMBIGUOUS_TICKER',
            'UNSUPPORTED_RECOMMENDATION',
            'LOW_RAG_CONFIDENCE',
            'PARTIAL_EXTERNAL_OUTAGE',
          ],
        }),
        {},
      )
    },
    checkLanguage(text) {
      return backendOrFixture(
        baseUrl,
        'languageCheck',
        { method: 'POST', body: JSON.stringify({ text }) },
        buildLanguageCheckFixture,
        { text },
      )
    },
    getRescueExample(mode = 'error') {
      return backendOrFixture(
        baseUrl,
        'rescueExample',
        {},
        () => buildRescueFixture({ mode }),
        { mode },
      )
    },
    uploadSource(input) {
      return fixtureResponse('sourceUpload', buildSourceUploadFixture, input)
    },
    runPortfolioReview(input) {
      return fixtureResponse('portfolioReview', buildPortfolioFixture, input)
    },
    reviewWikiRevision(input) {
      return fixtureResponse('wikiRevisionAction', buildWikiRevisionFixture, input)
    },
    runMarketBrief(input) {
      return fixtureResponse('marketBrief', buildMarketBriefFixture, input)
    },
    runStockSnapshot(input) {
      return fixtureResponse('stockSnapshot', buildStockSnapshotFixture, input)
    },
    getRunState(input) {
      return fixtureResponse('runState', buildRunStateFixture, input)
    },
  }
}

export const fixtures = {
  buildSourceUploadFixture,
  buildPortfolioFixture,
  buildWikiRevisionFixture,
  buildRescueFixture,
  buildMarketBriefFixture,
  buildStockSnapshotFixture,
  buildRunStateFixture,
}
