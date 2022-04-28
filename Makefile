clean:
	rm -rf dist/

build: clean
	tsc

format:
	prettier --write "./src/**/*"

watch:
	tsc --watch

run:
	./bin/knusperity
