.PHONY: install validate integration-test run

install:
	pip install -r requirements.txt

# --- env contract (see WORKFLOWS.md for the full black-box contract) -------
# Defaults live here so `make <target>` works standalone with zero config.
# The GHA workflows override these via their own env: blocks; the workflow
# author never edits this file, and this file never knows about GHA.
QC_PAYLOAD_PATH          ?= circuits/hello_noise.qasm
QC_EXECUTION_TARGET      ?= simulator
QC_BACKEND               ?= ibm_marrakesh
QC_CHANNEL               ?= ibm_quantum_platform
QC_SHOTS                 ?= 4096
QC_CORRELATION_THRESHOLD ?= 0.9
QC_JOB_TIMEOUT_SEC       ?= 1800
QC_RESULT_PATH           ?= result.json

export QC_PAYLOAD_PATH QC_EXECUTION_TARGET QC_BACKEND QC_CHANNEL QC_SHOTS \
       QC_CORRELATION_THRESHOLD QC_JOB_TIMEOUT_SEC QC_RESULT_PATH

# Structural + transpilation checks only. No network, no hardware. Fast.
# Used by branch validation (validate.yml).
validate:
	python validate.py

# Calibration-pull + Aer-noise-model + correlation-floor check. Connects to
# IBM Cloud to pull live calibration but spends no QPU time -- this is the
# nightly job (nightly.yml), and the one that faceplanted in #16.
integration-test:
	python test_integration.py

# Real hardware submission (qpu mode), blocking with timeout. Used by
# run-on-merge.yml, gated behind the prod environment's required reviewers.
run:
	python run.py
