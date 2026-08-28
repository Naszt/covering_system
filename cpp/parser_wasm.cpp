#define COVERING_PARSER_LIBRARY
#include "parser_bridge.cpp"

#include <emscripten/bind.h>

EMSCRIPTEN_BINDINGS(covering_parser) {
  emscripten::function("parseCovering", &parse_covering_document);
  emscripten::function("proveCovering", &prove_covering_document);
}
