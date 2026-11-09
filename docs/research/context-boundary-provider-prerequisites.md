# Provider prerequisites for context boundary evaluation

Repository maintainers can use this note to prepare a bounded evaluation of
`gpt-6.1-sol` and `gpt-6.1-terra`, each with `reasoning.effort: "high"`.
Recorded research date: **2026-11-09**. This is preserved dated research,
not a fresh source verification or execution authorization. The recorded
sources are public official OpenAI documentation. Costs are conditional;
account access, runtime compatibility and measured
boundary behavior remain unverified. No authenticated API calls or
credential inspection form part of this research.

## Exact models, capacity and processing tier

<!-- markdownlint-disable MD013 -->
| Model | Reasoning effort | API context window | Maximum output |
| --- | --- | --- | --- |
| `gpt-6.1-sol` | `high`, supported | 1,050,000 tokens | 128,000 tokens |
| `gpt-6.1-terra` | `high`, supported | 1,050,000 tokens | 128,000 tokens |
<!-- markdownlint-enable MD013 -->

The individual model pages establish these limits and require Responses
for tool calling:
[GPT-6.1 Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol) and
[GPT-6.1 Terra](https://developers.openai.com/api/docs/models/gpt-6.1-terra).
Neither model is interchangeable with an earlier model of the same family.
Sol's documented 500,000-token default in Codex and ChatGPT Work describes
those clients; it does not replace the API limit.

Input, reasoning and visible output share context capacity. Reasoning
tokens incur output charges. Reaching the context or output limit can
produce an incomplete response before visible output. The 128,000 maximum
therefore cannot be added to a full input window. Reserve a stated output
budget, including reasoning, before selecting the input boundary.
[Reasoning models](https://developers.openai.com/api/docs/guides/reasoning)

Use `service_tier: "default"` explicitly for Standard pricing. Omitting it
selects `auto`, which follows project configuration and does not establish
the intended tier. Record the actual tier returned by the provider.
[Responses reference](https://developers.openai.com/api/reference/cli/resources/responses/methods/create)

## Rates for cost estimates

All amounts are USD per one million tokens, for Standard processing on a
regular OpenAI endpoint. Cache reads are the cached-input rate. Writes use
the 30-minute lifetime in the main estimate.

<!-- markdownlint-disable MD013 -->
| Model | Total input in request | Ordinary input | Cache read | 30m write | Output |
| --- | --- | --- | --- | --- | --- |
| `gpt-6.1-sol` | Up to 272,000 | $2.00 | $0.10 | $2.50 | $10.00 |
| `gpt-6.1-sol` | Above 272,000 | $4.00 | $0.20 | $5.00 | $15.00 |
| `gpt-6.1-terra` | Up to 272,000 | $1.00 | $0.05 | $1.25 | $5.00 |
| `gpt-6.1-terra` | Above 272,000 | $2.00 | $0.10 | $2.50 | $7.50 |
<!-- markdownlint-enable MD013 -->

The [pricing page](https://developers.openai.com/api/docs/pricing) supplies
the Standard base rates. The individual
[Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol) and
[Terra](https://developers.openai.com/api/docs/models/gpt-6.1-terra) pages
state that input above 272,000 tokens doubles input and cache rates and
multiplies output rates by 1.5 **for the entire request**, including the
portion below the threshold. Long-context rows above apply that rule
arithmetically. Classify each request by its full input count, including
cached input; a cache hit does not make its prompt shorter.

The pricing page also lists 12-hour writes: $5.00 for Sol and $2.50 for
Terra before the long-context multiplier, or $10.00 and $5.00 above the
threshold. These estimates exclude taxes and hosted-tool fees. Regional
processing and regulated endpoints can add premiums; they require a
separate estimate if selected.

### Cache lifetime and accounting

For these model families, `prompt_cache_options.ttl: "30m"` selects the
default minimum lifetime. `"12h"` selects a different write rate. These
values do not specify deletion deadlines. A write rate is the total charge
for written tokens, not an extra charge added to ordinary input. Eligible
reads use the same rate for either lifetime. Preserve the exact settings
and classify usage into ordinary input, reads and writes.
[Prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching)

Use disjoint token counts `U` for ordinary input, `R` for cache reads, `W`
for 30-minute writes and `O` for all generated output. Derive ordinary
input from total input minus reads and writes. For each request:

```text
cost = (U * input_rate + R * read_rate + W * write_rate
        + O * output_rate) / 1,000,000
```

This follows the provider's
[cache accounting example](https://developers.openai.com/api/docs/guides/prompt-caching).
Do not add reasoning tokens a second time to reported `output_tokens`.

For an advance upper bound, assume all input uses the highest permitted
input rate: the 30-minute write rate when that lifetime is fixed. Multiply
the output limit by the applicable output rate and sum across every
permitted request, including model calls after tools and retries. This is
the method in OpenAI's
[spending controller example](https://developers.openai.com/cookbook/articles/per_run_spending_controller_responses_api).

As an arithmetic illustration, a single request with 900,000 total input
tokens and at most 25,000 output tokens costs at most **$4.875 for Sol** or
**$2.4375 for Terra**, conditional on 30-minute writes, these Standard rates
and no additional fees. Both use long-context rates. This illustration
does not set a test budget or prove that a particular payload fits. It
excludes counting calls because their fee remains unknown.

## Exact Responses input counting

The official
[token counting guide](https://developers.openai.com/api/docs/guides/token-counting)
documents `POST /v1/responses/input_tokens` and JavaScript
`client.responses.inputTokens.count(...)`. It promises an exact count of
the model's input, including request formatting, and instructs callers to
use the same payload as `responses.create`. Supported input covers
instructions, messages, images, files, tool definitions and conversations;
local plain-text tokenizers cannot establish this full count.

The
[counting reference](https://developers.openai.com/api/reference/resources/responses/subresources/input_tokens/methods/count)
includes `model`, `instructions`, `input`, `tools`, `tool_choice`,
`parallel_tool_calls`, `reasoning`, `text`, `previous_response_id` and
`conversation`. It returns an integer `input_tokens` and object type
`response.input_tokens`. Its published schema does not list every
generation parameter, including `service_tier`, `max_output_tokens` and
request-level `prompt_cache_options`. The guide's same-payload advice and
the narrower reference leave the handling of those fields unresolved for
a concrete implementation.

The resulting evidence is **documented exact counting support**, not a
successful count for either named model in this installation. Before any
count-dependent generation, establish that the count request preserves
every input-affecting field of the actual final Responses payload,
including schemas, tool outputs, reasoning settings and continuation
state. Resolve rejected or omitted fields explicitly. Do not call a
shortened transcript or an unverified projection an exact full count.

## Unresolved prerequisites

- **Counting fee:** the opened counting guide, endpoint reference and
  pricing page do not substantiate a price or an explicit free allowance.
  The fee is **unknown**, not zero. Obtain authoritative fee information
  before treating counting calls as unpaid preparation or adding them to
  an approved run budget.
- **Concrete count compatibility:** documented generic support does not
  establish successful handling of these exact models and the final
  payload in the installed SDK/account. Preserve both model IDs and
  `high`; do not substitute another model to clear this prerequisite.
- **Account access and limits:** public model documentation does not
  establish this installation's access, rate limits or regional pricing.
  Credentials and configuration flags do not authorize billable calls.
- **Boundary outcome and total spend:** neither measured context behavior
  nor a total run estimate exists without exact payload counts, request
  limits, output reservations and a counting fee. The rates above support
  a conditional estimate once those inputs are fixed.

Keep preparation at public-document research and local payload inspection
until these prerequisites and an explicit authorization for billable
provider calls are satisfied. Do not turn an unknown counting fee into an
unpaid API probe.
