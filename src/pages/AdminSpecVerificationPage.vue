<script setup>
import { computed, onMounted, ref } from 'vue'
import {
  createAdminSpecApi,
  endpointCatalog,
  stateModes,
} from '../api/adminSpecApi'

const defaultBaseUrl =
  import.meta.env.VITE_INVEST_API_BASE_URL || 'http://127.0.0.1:8000'

const features = [
  {
    id: 'source',
    label: '원문 업로드',
    endpointKey: 'sourceUpload',
    summary: '원문 파싱, 청킹, 실패 문서 분리를 확인합니다.',
  },
  {
    id: 'portfolio',
    label: '포트폴리오 점검',
    endpointKey: 'portfolioReview',
    summary: '상위 확인 항목, 숫자 근거, 원칙 충돌, 부분 실패를 확인합니다.',
  },
  {
    id: 'revision',
    label: '위키 revision',
    endpointKey: 'wikiRevisionAction',
    summary: 'diff, 근거, 검증 결과, 승인 action audit trail을 확인합니다.',
  },
  {
    id: 'rescue',
    label: '검증 rescue',
    endpointKey: 'rescueExample',
    summary: '차단 사유, 안전 섹션, 숨긴 섹션, 필요한 입력을 확인합니다.',
  },
  {
    id: 'run',
    label: '실행 상태',
    endpointKey: 'runState',
    summary: '현재 node, 마지막 이벤트, artifact 연결 상태를 확인합니다.',
  },
  {
    id: 'market',
    label: '시황 브리프',
    endpointKey: 'marketBrief',
    summary: 'risk-on/off/mixed 판단과 포트폴리오 연결 상태를 확인합니다.',
  },
  {
    id: 'snapshot',
    label: '종목 Snapshot',
    endpointKey: 'stockSnapshot',
    summary: 'thesis 변화, 관련 원칙, ticker 모호성 처리를 확인합니다.',
  },
  {
    id: 'language',
    label: '금지 표현 검사',
    endpointKey: 'languageCheck',
    summary: '매수/매도 지시, 목표가, 보장 표현 차단을 확인합니다.',
  },
]

const modeLabels = {
  success: 'Success',
  partial: 'Partial',
  empty: 'Empty',
  error: 'Error',
  loading: 'Loading',
}

const statusLabels = {
  pending: '검증 전',
  passed: '검증 통과',
  needs_revision: '수정 필요',
  needs_human_review: '사람 확인 필요',
  blocked: '차단',
  draft: '초안',
  verified: '검증됨',
  accepted: '승인됨',
  rejected: '거절됨',
  running: '실행 중',
  completed: '완료',
  failed: '실패',
  success: '성공',
  partial: '부분 성공',
  empty: '비어 있음',
  ok: '정상',
}

const baseUrl = ref(defaultBaseUrl)
const activeFeatureId = ref('portfolio')
const selectedMode = ref('success')
const loading = ref(false)
const loadError = ref('')
const responseData = ref(null)
const responseMeta = ref(null)
const responseError = ref(null)
const healthResult = ref(null)
const enumResult = ref(null)

const uploadTitle = ref('2026년 5월 손실 리뷰 메모')
const ticker = ref('AAPL')
const runId = ref('run_portfolio_2026_06_28')
const reviewAction = ref('approve')
const requestedChanges = ref('30% 초과 예외 기록 조건을 더 구체화합니다.')
const languageText = ref(
  '이 문장은 목표가나 매수 지시가 아니라 확인해야 할 질문을 남깁니다.',
)

const activeFeature = computed(
  () => features.find((feature) => feature.id === activeFeatureId.value) || features[0],
)

const activeEndpoint = computed(
  () => endpointCatalog[activeFeature.value.endpointKey],
)

const api = computed(() => createAdminSpecApi(baseUrl.value || defaultBaseUrl))

const resultStatus = computed(() => getResultStatus(responseData.value))
const currentRescue = computed(() => {
  const data = responseData.value

  return data?.payload || data?.rescue || data
})

const requestPreview = computed(() => {
  switch (activeFeatureId.value) {
    case 'source':
      return { title: uploadTitle.value, mode: selectedMode.value }
    case 'portfolio':
      return {
        mode: selectedMode.value,
        csv_schema: ['ticker', 'quantity', 'market_price', 'market_value', 'sector'],
      }
    case 'revision':
      return {
        revision_id: 'rev_2026_06_28_001',
        reviewAction: reviewAction.value,
        requestedChanges:
          reviewAction.value === 'request_changes' ? requestedChanges.value : [],
        mode: selectedMode.value,
      }
    case 'rescue':
      return { mode: selectedMode.value }
    case 'run':
      return { runId: runId.value, mode: selectedMode.value }
    case 'market':
      return { mode: selectedMode.value, connect_portfolio: true }
    case 'snapshot':
      return { ticker: ticker.value, mode: selectedMode.value }
    case 'language':
      return { text: languageText.value }
    default:
      return { mode: selectedMode.value }
  }
})

function getApi() {
  return createAdminSpecApi(baseUrl.value || defaultBaseUrl)
}

function formatJson(value) {
  if (!value) {
    return '{}'
  }

  return JSON.stringify(value, null, 2)
}

function statusLabel(status) {
  return statusLabels[status] || status || '대기'
}

function statusClass(status) {
  if (['passed', 'verified', 'accepted', 'completed', 'success', 'ok'].includes(status)) {
    return 'is-ok'
  }

  if (
    [
      'needs_revision',
      'needs_human_review',
      'partial',
      'draft',
      'pending',
      'running',
    ].includes(status)
  ) {
    return 'is-review'
  }

  if (['blocked', 'failed', 'rejected', 'error'].includes(status)) {
    return 'is-danger'
  }

  return 'is-info'
}

function getResultStatus(data) {
  if (!data) {
    return 'pending'
  }

  return (
    data.verification_status ||
    data.status ||
    data.report?.verification_status ||
    data.revision?.status ||
    data.run_state?.status ||
    data.payload?.verification_status ||
    data.rescue?.verification_status ||
    'pending'
  )
}

function setActiveFeature(featureId) {
  activeFeatureId.value = featureId
  loadError.value = ''
  responseError.value = null
  runSelected()
}

async function runConnectionCheck() {
  const client = getApi()
  const [health, enums] = await Promise.all([client.getHealth(), client.getEnums()])

  healthResult.value = health
  enumResult.value = enums
}

async function runSelected() {
  loading.value = true
  loadError.value = ''
  responseError.value = null

  try {
    const client = getApi()
    let result

    switch (activeFeatureId.value) {
      case 'source':
        result = await client.uploadSource({
          mode: selectedMode.value,
          title: uploadTitle.value,
        })
        break
      case 'portfolio':
        result = await client.runPortfolioReview({ mode: selectedMode.value })
        break
      case 'revision':
        result = await client.reviewWikiRevision({
          mode: selectedMode.value,
          reviewAction: reviewAction.value,
          requestedChanges: requestedChanges.value,
        })
        break
      case 'rescue':
        result = await client.getRescueExample(selectedMode.value)
        break
      case 'run':
        result = await client.getRunState({
          mode: selectedMode.value,
          runId: runId.value,
        })
        break
      case 'market':
        result = await client.runMarketBrief({ mode: selectedMode.value })
        break
      case 'snapshot':
        result = await client.runStockSnapshot({
          mode: selectedMode.value,
          ticker: ticker.value,
        })
        break
      case 'language':
        result = await client.checkLanguage(languageText.value)
        break
      default:
        result = await client.runPortfolioReview({ mode: selectedMode.value })
    }

    responseData.value = result.data
    responseMeta.value = result.meta
    responseError.value = result.error || null
  } catch (error) {
    loadError.value = error.message
  } finally {
    loading.value = false
  }
}

function sourceLabel(sourceRef) {
  return sourceRef?.citation_label || sourceRef?.source_id || 'source'
}

function percent(value) {
  if (value === null || value === undefined) {
    return '-'
  }

  return `${(Number(value) * 100).toFixed(1)}%`
}

function money(value, currency = 'USD') {
  if (value === null || value === undefined) {
    return '-'
  }

  return `${Number(value).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${currency}`
}

onMounted(async () => {
  await Promise.all([runConnectionCheck(), runSelected()])
})
</script>

<template>
  <div class="admin-shell">
    <header class="app-header">
      <div>
        <p class="eyebrow">LLMwiki Admin</p>
        <h1>스펙 기능 확인 작업대</h1>
        <p>
          추천 화면이 아니라 검증 상태, 출처, revision 승인, rescue 응답을 확인하는
          운영용 화면입니다.
        </p>
      </div>

      <form class="connection-form" @submit.prevent="runConnectionCheck">
        <label for="api-base-url">Backend base URL</label>
        <div class="url-row">
          <input id="api-base-url" v-model="baseUrl" type="url" />
          <button type="submit">연결 확인</button>
        </div>
      </form>
    </header>

    <section class="service-strip" aria-label="서비스 연결 상태">
      <div class="status-unit">
        <span>Health</span>
        <strong :class="statusClass(healthResult?.data?.status || 'pending')">
          {{ statusLabel(healthResult?.data?.status || 'pending') }}
        </strong>
      </div>
      <div class="status-unit">
        <span>Enums</span>
        <strong :class="statusClass(enumResult?.data ? 'ok' : 'pending')">
          {{ enumResult?.data ? '계약 로드됨' : '대기' }}
        </strong>
      </div>
      <div class="status-unit">
        <span>Active endpoint</span>
        <strong>{{ activeEndpoint.method }} {{ activeEndpoint.path }}</strong>
      </div>
      <div class="status-unit">
        <span>Response source</span>
        <strong>{{ responseMeta?.source || 'pending' }}</strong>
      </div>
    </section>

    <div class="workbench">
      <aside class="feature-rail" aria-label="기능 목록">
        <div class="rail-title">기능</div>
        <button
          v-for="feature in features"
          :key="feature.id"
          type="button"
          class="feature-button"
          :class="{ active: feature.id === activeFeatureId }"
          @click="setActiveFeature(feature.id)"
        >
          <span>{{ feature.label }}</span>
          <small>{{ endpointCatalog[feature.endpointKey].method }}</small>
        </button>
      </aside>

      <main class="detail-surface">
        <section class="detail-header">
          <div>
            <p class="eyebrow">{{ activeEndpoint.method }} {{ activeEndpoint.path }}</p>
            <h2>{{ activeFeature.label }}</h2>
            <p>{{ activeFeature.summary }}</p>
          </div>
          <div class="endpoint-state">
            <span :class="activeEndpoint.backendReady ? 'ready' : 'fixture'">
              {{ activeEndpoint.backendReady ? 'Backend ready' : 'Spec fixture' }}
            </span>
          </div>
        </section>

        <section class="control-panel" aria-label="기능 실행 옵션">
          <div class="mode-row">
            <span class="control-label">상태 시나리오</span>
            <div class="segmented" role="group" aria-label="상태 시나리오 선택">
              <button
                v-for="mode in stateModes"
                :key="mode"
                type="button"
                :class="{ active: selectedMode === mode }"
                @click="selectedMode = mode"
              >
                {{ modeLabels[mode] }}
              </button>
            </div>
          </div>

          <div class="input-grid">
            <label v-if="activeFeatureId === 'source'">
              원문 제목
              <input v-model="uploadTitle" type="text" />
            </label>

            <label v-if="activeFeatureId === 'snapshot'">
              Ticker
              <input v-model="ticker" type="text" />
            </label>

            <label v-if="activeFeatureId === 'run'">
              Run ID
              <input v-model="runId" type="text" />
            </label>

            <label v-if="activeFeatureId === 'revision'">
              Review action
              <select v-model="reviewAction">
                <option value="approve">approve</option>
                <option value="reject">reject</option>
                <option value="request_changes">request_changes</option>
              </select>
            </label>

            <label
              v-if="activeFeatureId === 'revision' && reviewAction === 'request_changes'"
              class="wide-field"
            >
              Requested changes
              <textarea v-model="requestedChanges" rows="3" />
            </label>

            <label v-if="activeFeatureId === 'language'" class="wide-field">
              검사 문장
              <textarea v-model="languageText" rows="4" />
            </label>
          </div>

          <div class="action-row">
            <button type="button" class="primary-action" :disabled="loading" @click="runSelected">
              {{ loading ? '실행 중' : '요청 실행' }}
            </button>
            <span v-if="loadError" class="inline-error">{{ loadError }}</span>
          </div>
        </section>

        <section class="status-strip" :class="statusClass(resultStatus)">
          <div>
            <span>상태</span>
            <strong>{{ statusLabel(resultStatus) }}</strong>
          </div>
          <div>
            <span>기준</span>
            <strong>
              {{
                responseData?.report?.as_of ||
                responseData?.snapshot?.as_of ||
                responseData?.revision?.created_at ||
                responseData?.run_state?.last_event_at ||
                responseData?.last_event_at ||
                '-'
              }}
            </strong>
          </div>
          <div>
            <span>품질 점수</span>
            <strong>{{ responseData?.verification?.quality_score ?? '-' }}</strong>
          </div>
        </section>

        <section v-if="loading" class="loading-block" aria-live="polite">
          <strong>요청 처리 중</strong>
          <span>선택한 상태 시나리오와 API 메타데이터를 준비하고 있습니다.</span>
        </section>

        <template v-else>
          <section v-if="activeFeatureId === 'source'" class="result-section">
            <h3>원문 처리 결과</h3>
            <p v-if="responseData?.message" class="muted-line">{{ responseData.message }}</p>
            <div class="summary-list">
              <div>
                <span>처리 상태</span>
                <strong>{{ statusLabel(responseData?.status) }}</strong>
              </div>
              <div>
                <span>파싱 단계</span>
                <strong>{{ responseData?.parsing_stage || '-' }}</strong>
              </div>
              <div>
                <span>문서</span>
                <strong>{{ responseData?.documents?.length || 0 }}</strong>
              </div>
              <div>
                <span>Chunks</span>
                <strong>{{ responseData?.chunks?.length || 0 }}</strong>
              </div>
            </div>

            <div v-if="responseData?.documents?.length" class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>document_id</th>
                    <th>type</th>
                    <th>title</th>
                    <th>published_at</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="document in responseData.documents" :key="document.document_id">
                    <td class="mono">{{ document.document_id }}</td>
                    <td>{{ document.document_type }}</td>
                    <td>{{ document.title }}</td>
                    <td class="mono">{{ document.published_at }}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div v-if="responseData?.failed_documents?.length" class="rescue-block">
              <h4>실패 문서</h4>
              <ul>
                <li v-for="failed in responseData.failed_documents" :key="failed.filename">
                  <strong>{{ failed.error_code }}</strong>
                  <span>{{ failed.filename }} - {{ failed.message }}</span>
                </li>
              </ul>
            </div>
          </section>

          <section v-if="activeFeatureId === 'portfolio'" class="result-section">
            <template v-if="responseData?.rescue">
              <RescueView :rescue="responseData.rescue" />
            </template>
            <template v-else>
              <h3>먼저 볼 3가지</h3>
              <ol class="priority-list">
                <li v-for="item in responseData?.checks || []" :key="item">{{ item }}</li>
              </ol>

              <h3>포트폴리오 상태</h3>
              <div class="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>종목</th>
                      <th>섹터</th>
                      <th>평가금액</th>
                      <th>비중</th>
                      <th>데이터</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="holding in responseData?.snapshot?.holdings || []"
                      :key="holding.ticker"
                    >
                      <td class="mono">{{ holding.ticker }}</td>
                      <td>{{ holding.sector }}</td>
                      <td class="numeric">
                        {{ money(holding.market_value, responseData.snapshot.base_currency) }}
                      </td>
                      <td class="numeric">{{ percent(holding.weight) }}</td>
                      <td>{{ holding.data_status }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <h3>원칙 충돌 가능성</h3>
              <div class="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>원칙</th>
                      <th>현재 상태</th>
                      <th>판단</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="conflict in responseData?.conflicts || []" :key="conflict.rule">
                      <td>{{ conflict.rule }}</td>
                      <td>{{ conflict.current_state }}</td>
                      <td>{{ conflict.judgment }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <SourceChips :items="responseData?.report?.source_refs || []" />
              <VerificationSummary :verification="responseData?.verification" />
            </template>
          </section>

          <section v-if="activeFeatureId === 'revision'" class="result-section">
            <template v-if="responseData?.message">
              <h3>{{ responseData.message }}</h3>
            </template>
            <template v-else>
              <div class="action-bar">
                <button type="button" @click="reviewAction = 'approve'; runSelected()">
                  approve
                </button>
                <button type="button" @click="reviewAction = 'reject'; runSelected()">
                  reject
                </button>
                <button type="button" @click="reviewAction = 'request_changes'; runSelected()">
                  request_changes
                </button>
              </div>

              <h3>변경 요약</h3>
              <p>{{ responseData?.revision?.change_summary }}</p>

              <h3>Before / After</h3>
              <div class="diff-block">
                <div>
                  <span>Before</span>
                  <p>{{ responseData?.revision?.diff_summary?.before }}</p>
                </div>
                <div>
                  <span>After</span>
                  <p>{{ responseData?.revision?.diff_summary?.after }}</p>
                </div>
              </div>

              <h3>근거</h3>
              <SourceChips :items="responseData?.revision?.source_refs || []" />

              <VerificationSummary :verification="responseData?.verification" />

              <h3>Review audit trail</h3>
              <div class="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>action</th>
                      <th>reviewer</th>
                      <th>created_at</th>
                      <th>requested_changes</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="record in responseData?.revision?.review_actions || []"
                      :key="record.created_at"
                    >
                      <td>{{ record.action }}</td>
                      <td>{{ record.reviewer }}</td>
                      <td class="mono">{{ record.created_at }}</td>
                      <td>{{ record.requested_changes?.join(', ') || '-' }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div class="action-bar bottom">
                <button type="button" @click="reviewAction = 'approve'; runSelected()">
                  approve
                </button>
                <button type="button" @click="reviewAction = 'reject'; runSelected()">
                  reject
                </button>
                <button type="button" @click="reviewAction = 'request_changes'; runSelected()">
                  request_changes
                </button>
              </div>
            </template>
          </section>

          <section v-if="activeFeatureId === 'rescue'" class="result-section">
            <RescueView :rescue="currentRescue" />
            <details v-if="responseData?.markdown" class="markdown-export">
              <summary>Markdown export</summary>
              <pre>{{ responseData.markdown }}</pre>
            </details>
          </section>

          <section v-if="activeFeatureId === 'run'" class="result-section">
            <RunStateView :run-state="responseData" />
          </section>

          <section v-if="activeFeatureId === 'market'" class="result-section">
            <template v-if="responseData?.rescue">
              <RescueView :rescue="responseData.rescue" />
            </template>
            <template v-else>
              <h3>시장 국면</h3>
              <div class="summary-list">
                <div>
                  <span>regime</span>
                  <strong>{{ responseData?.regime }}</strong>
                </div>
                <div>
                  <span>portfolio 연결</span>
                  <strong>{{ responseData?.portfolio_connection ? '있음' : '없음' }}</strong>
                </div>
              </div>
              <p>{{ responseData?.summary }}</p>
              <div class="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>신호</th>
                      <th>값</th>
                      <th>해석 라벨</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="signal in responseData?.signals || []" :key="signal.label">
                      <td>{{ signal.label }}</td>
                      <td class="mono">{{ signal.value }}</td>
                      <td>{{ signal.interpretation }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p class="muted-line">{{ responseData?.portfolio_connection }}</p>
              <SourceChips :items="responseData?.source_refs || []" />
            </template>
          </section>

          <section v-if="activeFeatureId === 'snapshot'" class="result-section">
            <template v-if="responseData?.questions?.[0]?.candidates">
              <RescueView :rescue="responseData" />
              <h3>Ticker 후보</h3>
              <div class="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>ticker</th>
                      <th>name</th>
                      <th>exchange</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="candidate in responseData.questions[0].candidates"
                      :key="candidate.ticker"
                    >
                      <td class="mono">{{ candidate.ticker }}</td>
                      <td>{{ candidate.name }}</td>
                      <td>{{ candidate.exchange }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </template>
            <template v-else>
              <h3>{{ responseData?.report?.title || responseData?.message }}</h3>
              <ul class="priority-list">
                <li v-for="change in responseData?.thesis_changes || []" :key="change">
                  {{ change }}
                </li>
              </ul>

              <h3>관련 원칙과 리스크</h3>
              <div class="chip-row">
                <span v-for="rule in responseData?.related_rules || []" :key="rule">
                  {{ rule }}
                </span>
              </div>

              <h3>출처별 요약</h3>
              <div class="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>source</th>
                      <th>summary</th>
                      <th>status</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="source in responseData?.source_summaries || []" :key="source.source_id">
                      <td class="mono">{{ source.source_id }}</td>
                      <td>{{ source.summary }}</td>
                      <td>{{ statusLabel(source.status) }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <h3>확인 질문</h3>
              <ul class="priority-list">
                <li v-for="question in responseData?.questions || []" :key="question">
                  {{ question }}
                </li>
              </ul>
            </template>
          </section>

          <section v-if="activeFeatureId === 'language'" class="result-section">
            <h3>검사 결과</h3>
            <p v-if="!responseData?.checks?.length" class="muted-line">
              현재 검증 게이트에서 차단 항목이 없습니다.
            </p>
            <div v-else class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>error_code</th>
                    <th>matched_text</th>
                    <th>replacement_hint</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="check in responseData.checks" :key="check.matched_text">
                    <td class="mono">{{ check.error_code }}</td>
                    <td>{{ check.matched_text }}</td>
                    <td>{{ check.replacement_hint || check.reason }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <ul class="priority-list">
              <li v-for="fix in responseData?.required_fixes || []" :key="fix">{{ fix }}</li>
            </ul>
          </section>
        </template>
      </main>

      <aside class="request-inspector" aria-label="요청과 응답">
        <section>
          <h2>Request</h2>
          <dl class="meta-list">
            <div>
              <dt>method</dt>
              <dd>{{ activeEndpoint.method }}</dd>
            </div>
            <div>
              <dt>path</dt>
              <dd class="mono">{{ activeEndpoint.path }}</dd>
            </div>
            <div>
              <dt>source</dt>
              <dd>{{ responseMeta?.source || 'pending' }}</dd>
            </div>
            <div>
              <dt>duration</dt>
              <dd>{{ responseMeta?.durationMs ?? '-' }}ms</dd>
            </div>
          </dl>
          <pre>{{ formatJson(requestPreview) }}</pre>
        </section>

        <section>
          <h2>Response</h2>
          <p v-if="responseError" class="inline-error">
            Backend fallback: {{ formatJson(responseError) }}
          </p>
          <pre>{{ formatJson(responseData) }}</pre>
        </section>

        <section>
          <h2>Canonical enums</h2>
          <pre>{{ formatJson(enumResult?.data) }}</pre>
        </section>
      </aside>
    </div>
  </div>
</template>

<script>
export default {
  components: {
    SourceChips: {
      props: {
        items: {
          type: Array,
          default: () => [],
        },
      },
      methods: {
        sourceLabel(sourceRef) {
          return sourceRef?.citation_label || sourceRef?.source_id || 'source'
        },
      },
      template: `
        <div class="source-block">
          <h3>출처</h3>
          <div class="chip-row">
            <span v-for="item in items" :key="item.source_id">
              {{ sourceLabel(item) }}
              <small v-if="item.as_of">{{ item.as_of }}</small>
            </span>
            <span v-if="!items.length">출처 없음</span>
          </div>
        </div>
      `,
    },
    VerificationSummary: {
      props: {
        verification: {
          type: Object,
          default: null,
        },
      },
      template: `
        <div class="verification-block">
          <h3>검증 결과</h3>
          <div v-if="verification" class="summary-list">
            <div>
              <span>status</span>
              <strong>{{ verification.status }}</strong>
            </div>
            <div>
              <span>quality_score</span>
              <strong>{{ verification.quality_score }}</strong>
            </div>
            <div>
              <span>safe_sections</span>
              <strong>{{ verification.safe_sections?.join(', ') || '-' }}</strong>
            </div>
            <div>
              <span>hidden_sections</span>
              <strong>{{ verification.hidden_sections?.join(', ') || '-' }}</strong>
            </div>
          </div>
          <div v-if="verification?.number_checks?.length" class="table-wrap compact-table">
            <table>
              <thead>
                <tr>
                  <th>gate</th>
                  <th>status</th>
                  <th>memo</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="check in verification.number_checks" :key="check.field || check.gate">
                  <td>{{ check.field || check.gate }}</td>
                  <td>{{ check.status }}</td>
                  <td>{{ check.calculation || check.memo }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <ul v-if="verification?.required_inputs?.length" class="priority-list">
            <li v-for="input in verification.required_inputs" :key="input">{{ input }}</li>
          </ul>
        </div>
      `,
    },
    RescueView: {
      props: {
        rescue: {
          type: Object,
          default: null,
        },
      },
      template: `
        <div class="rescue-block">
          <h3>검증 실패 / 확인 필요</h3>
          <div class="summary-list">
            <div>
              <span>status</span>
              <strong>{{ rescue?.verification_status || rescue?.status }}</strong>
            </div>
            <div>
              <span>error_code</span>
              <strong>{{ rescue?.error_code || '-' }}</strong>
            </div>
          </div>
          <p>{{ rescue?.message }}</p>
          <h4>막힌 이유</h4>
          <ul>
            <li v-for="reason in rescue?.blocked_reasons || []" :key="reason">{{ reason }}</li>
            <li v-if="!(rescue?.blocked_reasons || []).length">차단 사유 없음</li>
          </ul>
          <h4>안전하게 보여줄 수 있는 섹션</h4>
          <ul>
            <li v-for="section in rescue?.safe_sections || []" :key="section">{{ section }}</li>
            <li v-if="!(rescue?.safe_sections || []).length">없음</li>
          </ul>
          <h4>숨긴 섹션</h4>
          <ul>
            <li v-for="section in rescue?.hidden_sections || []" :key="section">{{ section }}</li>
            <li v-if="!(rescue?.hidden_sections || []).length">없음</li>
          </ul>
          <h4>필요한 입력</h4>
          <ul>
            <li v-for="input in rescue?.required_inputs || []" :key="input">{{ input }}</li>
            <li v-if="!(rescue?.required_inputs || []).length">추가 입력 없음</li>
          </ul>
        </div>
      `,
    },
    RunStateView: {
      props: {
        runState: {
          type: Object,
          default: null,
        },
      },
      template: `
        <div class="run-block">
          <h3>Agent 실행 상태</h3>
          <div class="summary-list">
            <div>
              <span>run_id</span>
              <strong>{{ runState?.run_id }}</strong>
            </div>
            <div>
              <span>agent</span>
              <strong>{{ runState?.agent_name }}</strong>
            </div>
            <div>
              <span>current_node</span>
              <strong>{{ runState?.current_node }}</strong>
            </div>
            <div>
              <span>status</span>
              <strong>{{ runState?.status }}</strong>
            </div>
          </div>
          <p>{{ runState?.progress_label }}</p>
          <h4>Artifact IDs</h4>
          <div class="chip-row">
            <span v-for="artifact in runState?.artifact_ids || []" :key="artifact">{{ artifact }}</span>
            <span v-if="!(runState?.artifact_ids || []).length">artifact 없음</span>
          </div>
          <h4>Warnings / Missing inputs</h4>
          <ul>
            <li v-for="warning in runState?.warnings || []" :key="warning">{{ warning }}</li>
            <li v-for="input in runState?.missing_inputs || []" :key="input">{{ input }}</li>
            <li v-if="!(runState?.warnings || []).length && !(runState?.missing_inputs || []).length">
              경고 또는 누락 입력 없음
            </li>
          </ul>
        </div>
      `,
    },
  },
}
</script>

<style>
.admin-shell {
  min-height: 100vh;
  background: var(--surface);
  color: var(--ink);
}

.app-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  padding: 24px 28px 18px;
  border-bottom: 1px solid var(--line);
  background: var(--panel);
}

.app-header h1,
.detail-header h2,
.request-inspector h2,
.result-section h3 {
  margin: 0;
  color: var(--ink);
  font-weight: 700;
  letter-spacing: 0;
}

.app-header h1 {
  font-size: 24px;
  line-height: 1.2;
}

.app-header p,
.detail-header p,
.muted-line {
  margin: 6px 0 0;
  color: var(--muted);
}

.eyebrow {
  margin: 0;
  color: var(--info);
  font-size: 13px;
  font-weight: 700;
}

.connection-form {
  width: min(440px, 100%);
}

.connection-form label,
.input-grid label {
  display: grid;
  gap: 6px;
  color: var(--muted);
  font-size: 13px;
  font-weight: 700;
}

.url-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
}

input,
select,
textarea,
button {
  font: inherit;
}

input,
select,
textarea {
  min-height: 44px;
  width: 100%;
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 9px 11px;
  color: var(--ink);
  background: var(--panel);
}

textarea {
  min-height: 88px;
  resize: vertical;
}

button {
  min-height: 44px;
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 9px 13px;
  color: var(--ink);
  background: var(--panel);
  cursor: pointer;
}

button:hover {
  border-color: var(--brand);
}

button:disabled {
  cursor: wait;
  opacity: 0.65;
}

.service-strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1px;
  border-bottom: 1px solid var(--line);
  background: var(--line);
}

.status-unit {
  display: grid;
  gap: 4px;
  min-width: 0;
  padding: 12px 16px;
  background: var(--panel);
}

.status-unit span,
.status-strip span,
.summary-list span,
.meta-list dt {
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
}

.status-unit strong,
.status-strip strong {
  overflow-wrap: anywhere;
  font-weight: 700;
}

.workbench {
  display: grid;
  grid-template-columns: 230px minmax(0, 1fr) 360px;
  min-height: calc(100vh - 154px);
}

.feature-rail {
  border-right: 1px solid var(--line);
  background: var(--panel);
  padding: 16px;
}

.rail-title {
  margin-bottom: 10px;
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
}

.feature-button {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  width: 100%;
  margin-bottom: 6px;
  text-align: left;
}

.feature-button span {
  font-weight: 700;
}

.feature-button small {
  color: var(--muted);
  font-family: var(--mono);
  font-size: 11px;
}

.feature-button.active {
  border-color: var(--brand);
  color: var(--brand);
  background: #eff6ff;
}

.detail-surface {
  min-width: 0;
  padding: 20px;
}

.detail-header,
.control-panel,
.result-section,
.request-inspector section {
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--panel);
}

.detail-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  padding: 18px;
}

.endpoint-state span {
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  border-radius: 6px;
  padding: 4px 9px;
  font-size: 13px;
  font-weight: 700;
}

.endpoint-state .ready {
  color: var(--ok);
  background: #f0fdf4;
}

.endpoint-state .fixture {
  color: var(--review);
  background: #fffbeb;
}

.control-panel {
  margin-top: 12px;
  padding: 16px;
}

.mode-row {
  display: grid;
  grid-template-columns: 120px minmax(0, 1fr);
  gap: 12px;
  align-items: center;
}

.control-label {
  color: var(--muted);
  font-size: 13px;
  font-weight: 700;
}

.segmented {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.segmented button {
  min-height: 36px;
  padding: 6px 10px;
}

.segmented button.active {
  border-color: var(--brand);
  color: var(--brand);
  background: #eff6ff;
}

.input-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-top: 14px;
}

.wide-field {
  grid-column: 1 / -1;
}

.action-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 14px;
}

.primary-action {
  border-color: var(--brand);
  color: #ffffff;
  background: var(--brand);
  font-weight: 700;
}

.status-strip {
  display: grid;
  grid-template-columns: 170px minmax(0, 1fr) 120px;
  gap: 1px;
  overflow: hidden;
  margin-top: 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--line);
}

.status-strip > div {
  display: grid;
  gap: 4px;
  min-width: 0;
  padding: 12px;
  background: var(--panel);
}

.status-strip.is-ok {
  border-color: color-mix(in srgb, var(--ok) 42%, var(--line));
}

.status-strip.is-review {
  border-color: color-mix(in srgb, var(--review) 42%, var(--line));
}

.status-strip.is-danger {
  border-color: color-mix(in srgb, var(--danger) 42%, var(--line));
}

.is-ok {
  color: var(--ok);
}

.is-review {
  color: var(--review);
}

.is-danger {
  color: var(--danger);
}

.is-info {
  color: var(--info);
}

.loading-block,
.result-section {
  margin-top: 12px;
  padding: 18px;
}

.loading-block {
  display: grid;
  gap: 6px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--panel);
}

.result-section h3 {
  margin-top: 20px;
  font-size: 19px;
}

.result-section h3:first-child {
  margin-top: 0;
}

.result-section h4 {
  margin: 16px 0 6px;
  font-size: 16px;
  font-weight: 700;
}

.priority-list {
  display: grid;
  gap: 8px;
  margin: 10px 0 0;
  padding-left: 22px;
}

.summary-list {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1px;
  overflow: hidden;
  margin: 10px 0 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--line);
}

.summary-list > div {
  display: grid;
  gap: 4px;
  min-width: 0;
  padding: 12px;
  background: #ffffff;
}

.summary-list strong {
  overflow-wrap: anywhere;
  font-weight: 700;
}

.table-wrap {
  overflow-x: auto;
  margin-top: 10px;
  border: 1px solid var(--line);
  border-radius: 8px;
}

table {
  width: 100%;
  min-width: 620px;
  border-collapse: collapse;
  background: #ffffff;
}

th,
td {
  border-bottom: 1px solid var(--line);
  padding: 10px 12px;
  text-align: left;
  vertical-align: top;
}

th {
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
}

tr:last-child td {
  border-bottom: 0;
}

.numeric {
  text-align: right;
  font-family: var(--mono);
}

.mono {
  font-family: var(--mono);
  font-size: 13px;
}

.chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.chip-row span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 30px;
  border: 1px solid #99f6e4;
  border-radius: 6px;
  padding: 4px 8px;
  color: var(--info);
  background: #f0fdfa;
  font-weight: 700;
}

.chip-row small {
  color: var(--muted);
  font-weight: 500;
}

.diff-block {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 10px;
}

.diff-block > div {
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 12px;
  background: #ffffff;
}

.diff-block span {
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
}

.diff-block p {
  margin: 8px 0 0;
}

.action-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #f8fafc;
}

.action-bar.bottom {
  margin-top: 18px;
}

.rescue-block {
  border: 1px solid #fecaca;
  border-radius: 8px;
  padding: 14px;
  background: #fef2f2;
}

.rescue-block h3,
.rescue-block h4 {
  color: var(--danger);
}

.verification-block,
.source-block,
.run-block {
  margin-top: 18px;
}

.markdown-export {
  margin-top: 14px;
}

.request-inspector {
  display: grid;
  align-content: start;
  gap: 12px;
  min-width: 0;
  border-left: 1px solid var(--line);
  padding: 20px 16px;
  background: #eef2f7;
}

.request-inspector section {
  min-width: 0;
  padding: 14px;
}

.request-inspector h2 {
  margin-bottom: 10px;
  font-size: 18px;
}

.meta-list {
  display: grid;
  gap: 8px;
  margin: 0 0 10px;
}

.meta-list div {
  display: grid;
  grid-template-columns: 82px minmax(0, 1fr);
  gap: 8px;
}

.meta-list dd {
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
  font-weight: 700;
}

pre {
  overflow: auto;
  max-height: 420px;
  margin: 0;
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 12px;
  color: #0f172a;
  background: #f8fafc;
  font-family: var(--mono);
  font-size: 12px;
  line-height: 1.5;
}

.inline-error {
  color: var(--danger);
  font-weight: 700;
}

@media (max-width: 1180px) {
  .workbench {
    grid-template-columns: 210px minmax(0, 1fr);
  }

  .request-inspector {
    grid-column: 1 / -1;
    border-top: 1px solid var(--line);
    border-left: 0;
  }
}

@media (max-width: 820px) {
  .app-header {
    display: grid;
    align-items: start;
    padding: 18px;
  }

  .service-strip {
    grid-template-columns: 1fr 1fr;
  }

  .workbench {
    display: block;
  }

  .feature-rail {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    border-right: 0;
    border-bottom: 1px solid var(--line);
  }

  .rail-title {
    display: none;
  }

  .feature-button {
    min-width: 170px;
    margin-bottom: 0;
  }

  .detail-surface,
  .request-inspector {
    padding: 14px;
  }

  .mode-row,
  .input-grid,
  .status-strip,
  .summary-list,
  .diff-block {
    grid-template-columns: 1fr;
  }

  .url-row {
    grid-template-columns: 1fr;
  }

  table {
    min-width: 560px;
  }
}
</style>
