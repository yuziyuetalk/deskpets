#import <AppKit/AppKit.h>
#import <CoreGraphics/CoreGraphics.h>
#include <math.h>
#include <stdio.h>
#include <string.h>
#include <unistd.h>

static BOOL isFullscreen(void) {
  NSRunningApplication *frontmost = [NSWorkspace sharedWorkspace].frontmostApplication;
  if (!frontmost) return NO;

  CFArrayRef windows = CGWindowListCopyWindowInfo(kCGWindowListOptionOnScreenOnly, kCGNullWindowID);
  if (!windows) return NO;
  BOOL fullscreen = NO;
  for (CFIndex index = 0; index < CFArrayGetCount(windows) && !fullscreen; index++) {
    CFDictionaryRef info = CFArrayGetValueAtIndex(windows, index);
    CFNumberRef ownerValue = CFDictionaryGetValue(info, kCGWindowOwnerPID);
    CFNumberRef layerValue = CFDictionaryGetValue(info, kCGWindowLayer);
    CFDictionaryRef boundsValue = CFDictionaryGetValue(info, kCGWindowBounds);
    int owner = 0;
    int layer = 0;
    CGRect bounds = CGRectZero;
    if (!ownerValue || !layerValue || !boundsValue ||
        !CFNumberGetValue(ownerValue, kCFNumberIntType, &owner) ||
        !CFNumberGetValue(layerValue, kCFNumberIntType, &layer) ||
        !CGRectMakeWithDictionaryRepresentation(boundsValue, &bounds) ||
        owner != frontmost.processIdentifier || layer != 0) continue;

    for (NSScreen *display in [NSScreen screens]) {
      NSRect frame = display.frame;
      if (fabs(bounds.size.width - frame.size.width) < 5 &&
          fabs(bounds.size.height - frame.size.height) < 5) {
        fullscreen = YES;
        break;
      }
    }
  }
  CFRelease(windows);
  return fullscreen;
}

int main(int argc, const char *argv[]) {
  @autoreleasepool {
    BOOL previous = NO;
    BOOL first = YES;
    do {
      BOOL current = isFullscreen();
      if (first || current != previous) {
        printf("FULLSCREEN %d\n", current ? 1 : 0);
        fflush(stdout);
      }
      previous = current;
      first = NO;
      if (argc > 1 && strcmp(argv[1], "--once") == 0) break;
      sleep(2);
    } while (YES);
  }
  return 0;
}
