#include "../../01_主线/形式化验证/code/covering.hpp"

#include <iostream>
#include <sstream>
#include <string>

namespace {

class JsonWriter {
  unsigned long long next_id_ = 1;

  static void string(std::ostream& out, const std::string& value) {
    out << '"';
    for (unsigned char character : value) {
      switch (character) {
        case '"': out << "\\\""; break;
        case '\\': out << "\\\\"; break;
        case '\b': out << "\\b"; break;
        case '\f': out << "\\f"; break;
        case '\n': out << "\\n"; break;
        case '\r': out << "\\r"; break;
        case '\t': out << "\\t"; break;
        default:
          if (character < 0x20) {
            static constexpr char hex[] = "0123456789abcdef";
            out << "\\u00" << hex[character >> 4] << hex[character & 15];
          } else {
            out << static_cast<char>(character);
          }
      }
    }
    out << '"';
  }

  std::string id() {
    return "node-" + std::to_string(next_id_++);
  }

  static bool is_zero(const Node& node) {
    return std::holds_alternative<I0>(node);
  }

  static bool contains_recursion(const Node& node) {
    if (auto tree = std::get_if<Tp>(&node)) return contains_recursion(**tree);
    if (auto forest = std::get_if<Fp>(&node)) {
      for (const auto& [arity, tree] : (**forest).son) {
        (void)arity;
        if (contains_recursion(*tree)) return true;
      }
    }
    return false;
  }

  static bool contains_recursion(const Tree& tree) {
    if (tree.is_rec) return true;
    for (const Node& child : tree.son) {
      if (contains_recursion(child)) return true;
    }
    return false;
  }

  static long long recursive_path_child(const Tree& tree) {
    if (tree.is_rec) return -1;
    long long candidate = -1;
    for (i8 branch = 0; branch < tree.n; ++branch) {
      if (contains_recursion(tree[branch])) {
        if (candidate != -1) return -1;
        candidate = static_cast<long long>(branch);
      } else if (!is_zero(tree[branch])) {
        return -1;
      }
    }
    return candidate;
  }

  void node(std::ostream& out, const Node& value) {
    if (std::holds_alternative<I0>(value)) {
      out << "{\"id\":";
      string(out, id());
      out << ",\"type\":\"leaf\",\"value\":0}";
      return;
    }
    if (std::holds_alternative<I1>(value)) {
      out << "{\"id\":";
      string(out, id());
      out << ",\"type\":\"leaf\",\"value\":1}";
      return;
    }
    if (auto tree = std::get_if<Tp>(&value)) {
      this->tree(out, **tree);
      return;
    }
    forest(out, **std::get_if<Fp>(&value));
  }

  void recursion(std::ostream& out) {
    out << "{\"id\":";
    string(out, id());
    out << ",\"type\":\"recursion\"}";
  }

  void tree(std::ostream& out, const Tree& value) {
    out << "{\"id\":";
    string(out, id());
    out << ",\"type\":\"tree\",\"arity\":" << value.n
        << ",\"recursive\":" << (value.is_rec ? "true" : "false");
    const long long path_child = recursive_path_child(value);
    if (path_child >= 0) out << ",\"recursivePathChild\":" << path_child;
    out << ",\"children\":[";
    for (i8 branch = 0; branch < value.n; ++branch) {
      if (branch) out << ',';
      if (value.is_rec && branch == value.pos) recursion(out);
      else node(out, value[branch]);
    }
    out << "]}";
  }

  void forest(std::ostream& out, const Forest& value) {
    if (value.son.size() == 1) {
      tree(out, *value.son.begin()->second);
      return;
    }
    out << "{\"id\":";
    string(out, id());
    out << ",\"type\":\"sum\",\"terms\":[";
    bool first = true;
    for (const auto& [arity, term] : value.son) {
      (void)arity;
      if (!first) out << ',';
      first = false;
      tree(out, *term);
    }
    out << "]}";
  }

public:
  static void quote(std::ostream& out, const std::string& value) {
    string(out, value);
  }

  void expression(std::ostream& out, const Node& value) {
    node(out, value);
  }

  void expression(std::ostream& out, const Forest& value) {
    forest(out, value);
  }

  void document(std::ostream& out, const Forest& value, const std::string& normalized) {
    out << "{\"ok\":true,\"normalized\":";
    string(out, normalized);
    out << ",\"ast\":";
    forest(out, value);
    out << '}';
  }

  static void error(std::ostream& out, const std::string& message) {
    out << "{\"ok\":false,\"error\":";
    string(out, message);
    out << '}';
  }
};

}  // namespace

std::string parse_covering_document(const std::string& source) {
  std::ostringstream output;
  try {
    Parser parser(source);
    auto forest = parser.parse();
    std::ostringstream normalized;
    normalized << *forest;
    JsonWriter writer;
    writer.document(output, *forest, normalized.str());
  } catch (const std::exception& error) {
    JsonWriter::error(output, error.what());
  }
  return output.str();
}

std::string prove_covering_document(const std::string& source) {
  std::ostringstream output;
  try {
    Parser parser(source);
    auto forest = parser.parse();
    JsonWriter writer;
    std::ostringstream normalized;
    normalized << *forest;

    output << "{\"ok\":true,\"input\":";
    JsonWriter::quote(output, normalized.str());
    output << ",\"inputAst\":";
    writer.expression(output, *forest);
    output << ",\"steps\":[";

    Node accumulated = I0{};
    bool first = true;
    std::size_t index = 0;
    for (const auto& [arity, tree] : forest->son) {
      (void)arity;
      Node before = copy(accumulated);
      Node term = copy(*tree);
      std::string expanded;
      Node after = plus(accumulated, term, false, &expanded);
      Fp expanded_forest;
      if (!expanded.empty()) {
        Parser expanded_parser(expanded);
        expanded_forest = expanded_parser.parse();
      }

      if (!first) output << ',';
      first = false;
      output << "{\"index\":" << ++index << ",\"kind\":\"add\",\"beforeText\":";
      JsonWriter::quote(output, show(before));
      output << ",\"termText\":";
      JsonWriter::quote(output, show(term));
      output << ",\"expandedText\":";
      JsonWriter::quote(output, expanded);
      output << ",\"afterText\":";
      JsonWriter::quote(output, show(after));
      output << ",\"before\":";
      writer.expression(output, before);
      output << ",\"term\":";
      writer.expression(output, term);
      if (expanded_forest) {
        output << ",\"expanded\":";
        writer.expression(output, *expanded_forest);
      }
      output << ",\"after\":";
      writer.expression(output, after);
      output << '}';
      accumulated = std::move(after);
    }

    output << "],\"resultText\":";
    JsonWriter::quote(output, show(accumulated));
    output << ",\"result\":";
    writer.expression(output, accumulated);
    output << ",\"covered\":" << (std::holds_alternative<I1>(accumulated) ? "true" : "false") << '}';
  } catch (const std::exception& error) {
    JsonWriter::error(output, error.what());
  }
  return output.str();
}

#ifndef COVERING_PARSER_LIBRARY
int main() {
  std::ios::sync_with_stdio(false);
  std::ostringstream input;
  input << std::cin.rdbuf();
  std::cout << parse_covering_document(input.str());
}
#endif
