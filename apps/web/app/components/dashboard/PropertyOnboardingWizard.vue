<script setup lang="ts">
import { CHANNEX_CURRENCIES } from '#shared/channex-currencies'
import { CHANNEX_COUNTRIES } from '#shared/channex-countries'

const props = defineProps<{
  networkId: number
  networkName: string
}>()

export type CreatedProperty = {
  id: number
  channexId: string
  name: string
  slug: string
}

const emit = defineEmits<{
  created: [property: CreatedProperty]
}>()

const step = ref(1)
const busy = ref(false)
const error = ref<string | null>(null)

const title = ref('')
const propertyType = ref('hotel')
const currency = ref('USD')
const timezone = ref('America/Santo_Domingo')
const address = ref('')
const city = ref('')
const country = ref('DO')
const state = ref('')
const zipCode = ref('')

const propertyTypes = [
  { value: 'hotel', label: 'Hotel' },
  { value: 'apartment', label: 'Apartment' },
  { value: 'villa', label: 'Villa' },
  { value: 'guest_house', label: 'Guest house' },
  { value: 'holiday_home', label: 'Holiday home' },
] as const

const currencies = CHANNEX_CURRENCIES
const countries = CHANNEX_COUNTRIES

const step1Valid = computed(() => title.value.trim().length >= 2)
const step2Valid = computed(
  () =>
    address.value.trim().length >= 3 &&
    city.value.trim().length >= 2 &&
    country.value.trim().length === 2,
)

function next() {
  error.value = null
  if (step.value === 1 && step1Valid.value) step.value = 2
  else if (step.value === 2 && step2Valid.value) step.value = 3
}

function back() {
  error.value = null
  if (step.value > 1) step.value -= 1
}

async function submit() {
  busy.value = true
  error.value = null
  try {
    const res = await $fetch<{ property: CreatedProperty }>('/api/onboarding/property', {
      method: 'POST',
      body: {
        networkId: props.networkId,
        title: title.value.trim(),
        propertyType: propertyType.value,
        currency: currency.value.trim(),
        timezone: timezone.value.trim(),
        address: address.value.trim(),
        city: city.value.trim(),
        country: country.value.trim(),
        state: state.value.trim() || undefined,
        zipCode: zipCode.value.trim() || undefined,
      },
    })
    emit('created', res.property)
  } catch (err: unknown) {
    const e = err as {
      data?: { statusMessage?: string; message?: string }
      statusMessage?: string
      message?: string
    }
    error.value =
      e?.data?.statusMessage ??
      e?.data?.message ??
      e?.statusMessage ??
      e?.message ??
      'Could not create property'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="wizard" aria-label="Add your first property">
    <header class="wizard-head">
      <p class="eyebrow">Get started</p>
      <h2>Add your first property</h2>
      <p>
        We create the property in Channex under
        <strong>{{ networkName }}</strong> and connect it to your workspace. No
        API keys or manual import — the platform handles channel sync.
      </p>
    </header>

    <ol class="steps" aria-label="Progress">
      <li :class="{ active: step >= 1, done: step > 1 }">Basics</li>
      <li :class="{ active: step >= 2, done: step > 2 }">Location</li>
      <li :class="{ active: step >= 3 }">Review</li>
    </ol>

    <form class="wizard-body" @submit.prevent="step === 3 ? submit() : next()">
      <div v-if="step === 1" class="step-fields">
        <label>
          <span>Property name</span>
          <input v-model="title" type="text" required placeholder="e.g. Palm Hills Residence" />
        </label>
        <label>
          <span>Property type</span>
          <select v-model="propertyType">
            <option v-for="t in propertyTypes" :key="t.value" :value="t.value">
              {{ t.label }}
            </option>
          </select>
        </label>
        <div class="row">
          <label>
            <span>Currency</span>
            <select v-model="currency" required>
              <option v-for="c in currencies" :key="c.code" :value="c.code">
                {{ c.label }}
              </option>
            </select>
          </label>
          <label>
            <span>Timezone</span>
            <input
              v-model="timezone"
              type="text"
              required
              placeholder="America/Santo_Domingo"
            />
          </label>
        </div>
      </div>

      <div v-else-if="step === 2" class="step-fields">
        <label>
          <span>Street address</span>
          <input v-model="address" type="text" required placeholder="123 Main Street" />
        </label>
        <div class="row">
          <label>
            <span>City</span>
            <input v-model="city" type="text" required />
          </label>
          <label>
            <span>Country</span>
            <select v-model="country" required>
              <option v-for="c in countries" :key="c.code" :value="c.code">
                {{ c.name }}
              </option>
            </select>
          </label>
        </div>
        <div class="row">
          <label>
            <span>State / region</span>
            <input v-model="state" type="text" placeholder="Optional" />
          </label>
          <label>
            <span>Postal code</span>
            <input v-model="zipCode" type="text" placeholder="Optional" />
          </label>
        </div>
      </div>

      <div v-else class="review">
        <dl>
          <div>
            <dt>Name</dt>
            <dd>{{ title }}</dd>
          </div>
          <div>
            <dt>Type</dt>
            <dd>{{ propertyTypes.find((t) => t.value === propertyType)?.label }}</dd>
          </div>
          <div>
            <dt>Currency / timezone</dt>
            <dd>{{ currency }} · {{ timezone }}</dd>
          </div>
          <div>
            <dt>Address</dt>
            <dd>
              {{ address }}, {{ city }}
              <template v-if="state">, {{ state }}</template>
              {{ country }}
              <template v-if="zipCode"> {{ zipCode }}</template>
            </dd>
          </div>
        </dl>
      </div>

      <p v-if="error" class="msg failed" role="alert">{{ error }}</p>

      <div class="actions">
        <button v-if="step > 1" type="button" class="btn-ghost" :disabled="busy" @click="back">
          Back
        </button>
        <button
          v-if="step < 3"
          type="submit"
          class="btn-primary"
          :disabled="(step === 1 && !step1Valid) || (step === 2 && !step2Valid)"
        >
          Continue
        </button>
        <button v-else type="submit" class="btn-primary" :disabled="busy">
          {{ busy ? 'Creating in Channex…' : 'Create property' }}
        </button>
      </div>
    </form>
  </section>
</template>

<style scoped>
.wizard {
  padding: 1.6rem 1.5rem;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface);
}

.wizard-head h2 {
  margin: 0 0 0.55rem;
  font-family: Manrope, sans-serif;
  font-size: 1.35rem;
}

.wizard-head p {
  max-width: 42rem;
  margin: 0;
  color: var(--muted);
  line-height: 1.55;
  font-size: 0.88rem;
}

.steps {
  display: flex;
  gap: 0.5rem;
  margin: 1.35rem 0 0;
  padding: 0;
  list-style: none;
}

.steps li {
  flex: 1;
  padding: 0.45rem 0.6rem;
  border: 1px solid var(--line);
  border-radius: 0.45rem;
  color: var(--faint);
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  text-align: center;
}

.steps li.active {
  border-color: var(--accent);
  color: var(--accent-strong);
  background: var(--accent-soft);
}

.steps li.done {
  color: var(--muted);
}

.wizard-body {
  margin-top: 1.25rem;
}

.step-fields {
  display: grid;
  gap: 0.9rem;
  max-width: 32rem;
}

.step-fields label > span,
.review dt {
  display: block;
  margin-bottom: 0.35rem;
  color: var(--muted);
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.step-fields input,
.step-fields select {
  width: 100%;
  padding: 0.65rem 0.75rem;
  border: 1px solid var(--line-strong);
  border-radius: calc(var(--radius) - 0.2rem);
  background: var(--surface-raised);
  color: var(--ink);
  font-size: 0.88rem;
}

.step-fields input:focus,
.step-fields select:focus {
  outline: 2px solid var(--accent-soft);
  border-color: var(--accent);
}

.row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.9rem;
}

.mono {
  font-family: ui-monospace, monospace;
  text-transform: uppercase;
}

.review dl {
  margin: 0;
  display: grid;
  gap: 0.85rem;
  max-width: 32rem;
}

.review dd {
  margin: 0;
  font-size: 0.92rem;
}

.msg {
  margin: 1rem 0 0;
  font-size: 0.78rem;
}

.failed {
  color: var(--danger);
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.7rem;
  margin-top: 1.25rem;
}

.btn-primary,
.btn-ghost {
  padding: 0.65rem 1rem;
  border-radius: 0.55rem;
  font-size: 0.88rem;
  font-weight: 600;
  cursor: pointer;
}

.btn-primary {
  border: 0;
  background: var(--accent);
  color: #04201a;
}

.btn-primary:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.btn-ghost {
  border: 1px solid var(--line-strong);
  background: transparent;
  color: var(--ink);
}

@media (max-width: 640px) {
  .row {
    grid-template-columns: 1fr;
  }

  .steps {
    flex-direction: column;
  }
}
</style>
