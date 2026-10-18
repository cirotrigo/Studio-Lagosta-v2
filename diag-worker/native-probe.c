/* Diagnostic only: a known native SIGSEGV validates the same core/GDB path. */
__attribute__((noinline)) void diag_native_capture_probe(void) {
  volatile int *p = (volatile int *)0;
  *p = 42;
}
int main(void) { diag_native_capture_probe(); return 0; }
