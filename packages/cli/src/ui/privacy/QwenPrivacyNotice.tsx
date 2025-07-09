/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text, useInput } from 'ink';
import { Colors } from '../colors.js';

interface QwenPrivacyNoticeProps {
  onExit: () => void;
}

export function QwenPrivacyNotice({ onExit }: QwenPrivacyNoticeProps): React.JSX.Element {
  useInput((input, key) => {
    if (key.escape || input === 'q' || input === 'Q') {
      onExit();
    }
  });

  return (
    <Box
      borderStyle="round"
      borderColor={Colors.AccentBlue}
      flexDirection="column"
      padding={1}
      width="100%"
    >
      <Box marginBottom={1}>
        <Text bold color={Colors.AccentBlue}>
          TongYi Qwen API Privacy Notice
        </Text>
      </Box>
      
      <Box marginBottom={1}>
        <Text>
          You are using TongYi Qwen API through Alibaba Cloud DashScope. Please note:
        </Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Text color={Colors.AccentYellow}>• Data Processing:</Text>
        <Text>  Your prompts and conversations are sent to Alibaba Cloud servers</Text>
        <Text>  for processing by TongYi Qwen models.</Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Text color={Colors.AccentYellow}>• Data Retention:</Text>
        <Text>  Please refer to Alibaba Cloud's data retention policies.</Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Text color={Colors.AccentYellow}>• Privacy Policy:</Text>
        <Text>  https://www.alibabacloud.com/help/legal/latest/privacy-policy</Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Text color={Colors.AccentYellow}>• Service Terms:</Text>
        <Text>  https://www.alibabacloud.com/help/legal/latest/universal-service-terms</Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Text color={Colors.AccentYellow}>• API Documentation:</Text>
        <Text>  https://help.aliyun.com/zh/dashscope/</Text>
      </Box>

      <Box marginTop={1}>
        <Text color={Colors.Gray}>
          By using TongYi Qwen API, you acknowledge that you have read and agree to
        </Text>
      </Box>
      <Box>
        <Text color={Colors.Gray}>
          Alibaba Cloud's privacy policy and service terms.
        </Text>
      </Box>

      <Box marginTop={2}>
        <Text color={Colors.AccentGreen}>
          Press ESC or 'q' to close this notice
        </Text>
      </Box>
    </Box>
  );
} 