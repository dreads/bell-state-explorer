.PHONY: install integration-test

install:
	pip install -r requirements.txt

# Mode (plain local AerSimulator vs. a local AerSimulator seeded with a real
# IBM backend's noise snapshot, after a genuine IBM Cloud auth check) is
# decided by run_circuit.py from the presence of QISKIT_IBM_TOKEN in the
# environment -- both GHA workflows call this same target, differing only
# in whether that secret is exported.
integration-test:
	python test_integration.py
