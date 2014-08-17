/*
Copyright (c) Microsoft Open Technologies, Inc.
All Rights Reserved
Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the
License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0

THIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, EITHER EXPRESS OR IMPLIED,
INCLUDING WITHOUT LIMITATION ANY IMPLIED WARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,
MERCHANTABLITY OR NON-INFRINGEMENT.

See the Apache 2 License for the specific language governing permissions and limitations under the License.
*/

package com.msopentech.ThaliAndroidClientUtilities;

import com.msopentech.thali.utilities.universal.CreateClientBuilder;
import com.msopentech.thali.utilities.universal.ThaliCouchDbInstance;
import org.apache.http.client.HttpClient;
import org.ektorp.android.http.AndroidHttpClient;
import java.net.Proxy;
import java.security.*;

/**
 * This is an exact copy of the AndroidEktorpCreateClientBuilder class from Android Utilities but there is no
 * sane way (outside of using reflection) to get an AAR dependency into a crosswalk extension. Since this is
 * the only code we currently need we just copied it over. But once we start using the crosswalk view control
 * then we should be able to use the AAR dependency and get rid of this.
 * https://github.com/thaliproject/ThaliHTML5ApplicationFramework/issues/18
 */
public class AndroidEktorpCreateClientBuilder extends CreateClientBuilder {
    @Override
    public org.ektorp.http.HttpClient CreateEktorpClient(String host, int port, PublicKey serverPublicKey,
                                                         KeyStore clientKeyStore, char[] clientKeyStorePassPhrase,
                                                         Proxy proxy)
            throws UnrecoverableKeyException, NoSuchAlgorithmException, KeyStoreException, KeyManagementException {
        return new AndroidHttpClient(CreateApacheClient(host, port, serverPublicKey, clientKeyStore,
                clientKeyStorePassPhrase, proxy));
    }

    @Override
    public HttpClient extractApacheClientFromThaliCouchDbInstance(ThaliCouchDbInstance thaliCouchDbInstance) {
        return ((AndroidHttpClient)thaliCouchDbInstance.getConnection()).getClient();
    }
}
