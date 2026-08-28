#include "../../01_主线/形式化验证/code/covering.hpp"

#include <iostream>
#include <string>

int main(int argc, char** argv) {
  if (argc != 2) {
    std::cerr << "usage: cpp-parser-probe EXPRESSION\n";
    return 2;
  }

  try {
    Parser parser(argv[1]);
    auto forest = parser.parse();
    std::cout << *forest;
    return 0;
  } catch (const std::exception& error) {
    std::cerr << error.what() << '\n';
    return 1;
  }
}
