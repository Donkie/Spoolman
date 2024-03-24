######################################################
# Core Configurations (Do Not Edit)
######################################################
BIN_PATH ?= bin

MAKEFILE_JUSTNAME := $(firstword $(MAKEFILE_LIST))
MAKEFILE_COMPLETE := $(CURDIR)/$(MAKEFILE_JUSTNAME)
MAKE_OPTIONS := -f $(MAKEFILE_JUSTNAME)

######################################################
# Initial Values (Overrides Included Defaults)
######################################################

DOCKER_IMAGE = ghcr.io/donkie/spoolman
HELM_FOLDER  = $(CURDIR)
HELM_PROJECT = spoolman
HELM_NAME    = spoolman

######################################################
# Default Command (Must Be First)
######################################################
.PHONY: default
default: test

$(BIN_PATH):
	mkdir -p $@

######################################################
# Include Helm
######################################################
$(BIN_PATH)/helm.mk: Makefile | $(BIN_PATH)
	$(MAKEFILE_DOWNLOAD_COMMAND) https://gitlab.com/twistersfury/utilities/-/raw/v3.0.0-alpha+20/make/helm.mk

ifndef MAKEFILE_HELM
include $(BIN_PATH)/helm.mk
endif

######################################################
# Include Local Overrides
######################################################
# If you don't have wget, then you can manually edit
# 	bin/overrides.mk to enable curl

$(BIN_PATH)/values-local.yaml: | $(BIN_PATH)
	@echo '#application:'              > $@
	@echo '#  claimName: spoolman'    >> $@
	@echo '#  environment:'           >> $@
	@echo '#    TS: Europe/Stockholm' >> $@
	@echo ''
	@echo 'Default $@ Local Values Created. Modify it or supply your own yaml using HELM_CONFIG'
	@echo ''


$(BIN_PATH)/overrides.mk: | $(BIN_PATH)/values-local.yaml
	@echo 'MAKEFILE_OVERRIDES := true' > $@
	@echo 'MAKEFILE_DOWNLOAD_COMMAND = wget -O $$@' >> $@
	@echo '#MAKEFILE_DOWNLOAD_COMMAND = curl -o $$@' >> $@
	@echo 'HELM_CONFIG = bin/values-local.yaml' >> $@
	@echo "Override File Created, You Will Have To Rerun The Previous Command."
	@echo "By default, this script attempts to use wget. If you don't have wget, you can use curl instead."
	@echo "If you want to use curl, edit the $@ file to use the curl version of MAKEFILE_DOWNLOAD_COMMAND." && exit 1

# Only Include If Not Already Included (Will Cause Errors Otherwise)
ifndef MAKEFILE_OVERRIDES
include $(BIN_PATH)/overrides.mk
endif

######################################################
# Core Commands
######################################################

.PHONY: clean
clean:
	rm -rf bin

######################################################
# Docker Commands
######################################################

DOCKER_PULL ?= --pull
DOCKER_LOAD ?= --load

.PHONY: kubectl-restart
kubectl-build:
	kubectl get pods -l tf.deployment=palworld --no-headers -o custom-columns=":metadata.name" | xargs -I {} kubectl delete pod {}

.PHONY: docker-build
docker-build:
	docker buildx build --memory 10Gb --memory-swap 5Gb $(DOCKER_PULL) -t $(DOCKER_IMAGE)-development --target=python-builder -f ../Dockerfile . $(DOCKER_OPTIONS) $(DOCKER_LOAD)
	docker buildx build --memory 10Gb --memory-swap 5Gb $(DOCKER_PULL) -t $(DOCKER_IMAGE) -f ../Dockerfile . $(DOCKER_OPTIONS) $(DOCKER_LOAD)
	$(MAKE) kubectl-build

.PHONY: docker-build-push
docker-build-push: DOCKER_LOAD=--push
docker-build-push: docker-build