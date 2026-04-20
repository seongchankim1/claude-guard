import javax.xml.parsers.DocumentBuilderFactory;
public class Parser {
  public static DocumentBuilderFactory newSafe() throws Exception {
    DocumentBuilderFactory f = DocumentBuilderFactory.newInstance();
    f.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
    return f;
  }
}
