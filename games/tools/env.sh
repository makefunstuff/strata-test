# Source this to export STRATA_BASE_URL / STRATA_API_KEY from the host's pi config when they are not set.
# Nothing here is committed with values; they stay on the host.
: "${STRATA_BASE_URL:=$(node -p 'require(process.env.HOME + "/.pi/agent/models.json").providers.strata.baseUrl')}"
: "${STRATA_API_KEY:=$(node -p 'require(process.env.HOME + "/.pi/agent/models.json").providers.strata.apiKey')}"
export STRATA_BASE_URL STRATA_API_KEY
